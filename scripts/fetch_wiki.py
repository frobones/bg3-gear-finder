"""Snapshot gear data from bg3.wiki's Cargo tables into static JSON files.

Run by hand; the webpage only ever reads data/.

    python3 scripts/fetch_wiki.py            # rebuild data/ from cache/wiki/, fetching only what is missing
    python3 scripts/fetch_wiki.py --refresh  # re-download everything from bg3.wiki first

Reads data/region_order.json (hand-maintained) and writes items.json,
acquisitions.json, locations.json and meta.json into data/.
"""

import argparse
import hashlib
import html
import json
import random
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

WIKI = "https://bg3.wiki"
API = f"{WIKI}/w/api.php"
EXPORT = f"{WIKI}/w/index.php?title=Special:CargoExport"
USER_AGENT = "bg3-item-tool/0.1 (personal project; snapshot script)"
ROW_LIMIT = 5000
TIMEOUT_S = 60
MAX_ATTEMPTS = 4
REQUEST_SPACING_S = 1.0  # courtesy gap between requests; bg3.wiki rate-limits bursts with 429
MAX_RETRY_AFTER_S = 120.0

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
CACHE_DIR = ROOT / "cache" / "wiki"

GEAR_TABLES = {"equipment": "equipment", "weapons": "weapon"}

# item_locations / locations.region values that differ from a location's name.
LOCATION_ALIASES = {
    "Creche Y'llek": "Crèche Y'llek",
    "The Risen Road": "Risen Road",
    "ShadowCursed Lands": "Shadow-Cursed Lands",
}
# Regions referenced as a parent but with no row of their own in `locations`.
EXTRA_ROOTS = {"Avernus": "three"}

# File/Category links may nest one ordinary link in their alt text: [[File:x.png|alt=Recharge: [[Long rest]]]]
FILE_LINK = re.compile(r"\[\[(?:File|Category):(?:[^\[\]]|\[\[[^\]]*\]\])*\]\]")
WIKI_LINK = re.compile(r"\[\[([^\]|]+)(?:\|([^\]]*))?\]\]")
SUP = re.compile(r"<sup\b.*?</sup>", re.S)
ABBR = re.compile(r"<abbr\b[^>]*\btitle=\"([^\"]*)\"[^>]*>.*?</abbr>", re.S)
LINE_BREAK = re.compile(r"<br\s*/?>|</(?:dt|dd|li|p|div|tr)>", re.I)
TAG = re.compile(r"<[^>]+>")
EMPHASIS = re.compile(r"'{2,}")
TABLE_CONTROL = re.compile(r"^\s*(?:\{\||\|-|\|\})")


def _get_json_once(request: urllib.request.Request) -> Any:
    with urllib.request.urlopen(request, timeout=TIMEOUT_S) as response:  # noqa: S310 -- fixed https bg3.wiki URLs only
        return json.load(response)


def _retry_delay(attempt: int, error: urllib.error.URLError) -> float:
    """Seconds to wait before retrying, or raise if the error is not worth retrying."""
    if isinstance(error, urllib.error.HTTPError):
        if error.code != 429 and error.code < 500:
            raise error
        retry_after = error.headers.get("Retry-After", "")
        if retry_after.isdigit():
            return min(float(retry_after), MAX_RETRY_AFTER_S)
    return 2**attempt + random.random()  # noqa: S311 -- backoff jitter, not cryptographic


class WikiClient:
    """Fetches Cargo data from bg3.wiki, keeping each raw response in a local cache.

    Cached responses are reused unless `refresh` is set, so re-processing never hits the wiki.
    """

    def __init__(self, cache_dir: Path, refresh: bool) -> None:
        self.cache_dir = cache_dir
        self.refresh = refresh
        self.oldest_fetch: datetime | None = None
        self.network_requests = 0
        self._last_request = 0.0

    def get_json(self, name: str, url: str) -> Any:
        """Return the cached response for `name`, fetching `url` first if needed."""
        path = self.cache_dir / f"{name}.json"
        if self.refresh or not path.exists():
            self.cache_dir.mkdir(parents=True, exist_ok=True)
            payload = {"fetched_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"), "url": url}
            payload["data"] = self._fetch(url)
            path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        cached = json.loads(path.read_text(encoding="utf-8"))
        fetched = datetime.fromisoformat(cached["fetched_utc"])
        self.oldest_fetch = fetched if self.oldest_fetch is None else min(self.oldest_fetch, fetched)
        return cached["data"]

    def _fetch(self, url: str) -> Any:
        """GET JSON politely: one request per second, retrying 429/5xx with Retry-After or backoff."""
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        for attempt in range(1, MAX_ATTEMPTS):
            try:
                return self._spaced_request(request)
            except urllib.error.URLError as exc:
                time.sleep(_retry_delay(attempt, exc))
        return self._spaced_request(request)  # final attempt: let the error propagate with its context

    def _spaced_request(self, request: urllib.request.Request) -> Any:
        time.sleep(max(0.0, self._last_request + REQUEST_SPACING_S - time.monotonic()))
        self._last_request = time.monotonic()
        self.network_requests += 1
        return _get_json_once(request)

    def schema(self, table: str) -> dict:
        """Return {field: {"type": ..., "isList": ...}} for a Cargo table."""
        query = urllib.parse.urlencode({"action": "cargofields", "table": table, "format": "json"})
        return self.get_json(f"{table}.schema", f"{API}?{query}")["cargofields"]

    def export(self, table: str, schema: dict) -> list[dict]:
        """Export every row and field of a Cargo table; field names come back with underscores."""
        fields = ["_pageName", *(f for f in schema if f != "cargo_uid")]
        query = urllib.parse.urlencode(
            {"tables": table, "fields": ",".join(fields), "limit": ROW_LIMIT, "format": "json"}
        )
        rows = self.get_json(f"{table}.rows", f"{EXPORT}&{query}")
        if len(rows) >= ROW_LIMIT:
            raise RuntimeError(f"{table}: export hit the {ROW_LIMIT}-row limit; add paging")
        return [{key.replace(" ", "_"): value for key, value in row.items()} for row in rows]


def unescape(value: Any) -> Any:
    """CargoExport HTML-escapes strings, sometimes twice."""
    return html.unescape(html.unescape(value)) if isinstance(value, str) else value


def wiki_url(target: str) -> str:
    return f"{WIKI}/wiki/" + urllib.parse.quote(target.strip().replace(" ", "_"), safe="/#():',")


def file_url(name: str) -> str:
    """Direct image URL using MediaWiki's hashed upload path (MD5 is its path scheme, not security)."""
    name = name.removeprefix("File:").strip().replace(" ", "_")
    digest = hashlib.md5(name.encode()).hexdigest()
    return f"{WIKI}/w/images/{digest[0]}/{digest[:2]}/{urllib.parse.quote(name)}"


def _clean_line(line: str) -> str:
    """Flatten one line: unwrap wiki-table cells and list markers, collapse whitespace."""
    if TABLE_CONTROL.match(line):
        return ""
    if line.lstrip().startswith("|"):
        line = line.rsplit("|", 1)[-1]  # table cell: content follows the last attribute separator
    line = re.sub(r"[\s  ]+", " ", line).strip()
    if line[:1] in "*#:;" and line:
        line = "• " + line.lstrip("*#:; ")
    return line


def clean_wikitext(raw: str | None) -> tuple[str | None, list[dict]]:
    """Reduce rendered-ish wikitext to plain text (one entry per line) plus the wiki links it contained."""
    if not raw:
        return None, []
    text = unescape(raw)
    text = SUP.sub("", text)
    text = ABBR.sub(r"\1", text)
    text = FILE_LINK.sub("", text)
    links: list[dict] = []

    def replace_link(match: re.Match) -> str:
        target, label = match.group(1).strip(), match.group(2)
        label = (label if label is not None else target).strip()
        page = target.split("#")[0].replace("_", " ").strip()
        link = {"text": label, "page": page, "url": wiki_url(target)}
        if link not in links:
            links.append(link)
        return label

    text = WIKI_LINK.sub(replace_link, text)
    text = LINE_BREAK.sub("\n", text)
    text = TAG.sub("", text)
    text = EMPHASIS.sub("", text)
    text = "\n".join(line for line in map(_clean_line, text.split("\n")) if line)
    return text or None, links


def to_bool(value: str | int | None) -> bool | None:
    """CargoExport renders Boolean fields as 1/0, as ints or strings depending on the table."""
    if value is None:
        return None
    if value not in (0, 1, "0", "1"):
        raise ValueError(f"Unexpected Cargo boolean {value!r}")
    return str(value) == "1"


def normalize_row(row: dict, schema: dict) -> dict:
    """Unescape strings, clean Wikitext fields, tidy lists, and add file URLs."""
    out = {"page": unescape(row["_pageName"])}
    for field, spec in schema.items():
        if field == "cargo_uid":
            continue
        value = row.get(field)
        if spec.get("isList") is not None:
            value = [unescape(v).strip() for v in value or [] if v and unescape(v).strip()]
        elif spec["type"] == "Wikitext":
            value, links = clean_wikitext(value)
            if field == "where_to_find":
                out["where_to_find_links"] = links
        elif spec["type"] == "Boolean":
            value = to_bool(value)
        else:
            value = unescape(value)
            if isinstance(value, str):
                value = value.strip() or None
        out[field] = value
        if spec["type"] == "File" and value:
            out[f"{field}_url"] = file_url(value)
    return out


def build_items(wiki: WikiClient) -> dict[str, dict]:
    """One record per item page; extra Cargo rows on the same page become variants."""
    items: dict[str, dict] = {}
    for table, kind in GEAR_TABLES.items():
        schema = wiki.schema(table)
        for row in wiki.export(table, schema):
            record = normalize_row(row, schema)
            page = record["page"]
            existing = items.get(page)
            if existing is None:
                added = {"id": page, "kind": kind, "wiki_url": wiki_url(page), "variants": []}
                if clash := added.keys() & record.keys():
                    raise RuntimeError(f"{table} has fields that clash with added keys: {sorted(clash)}")
                items[page] = {**added, **record}
            elif existing["kind"] != kind:
                raise RuntimeError(f"{page} appears in both gear tables")
            else:
                existing["variants"].append(record)
    return items


def build_locations(wiki: WikiClient) -> dict[str, dict]:
    """Locations keyed by name, each with its act and root-first chain of parents."""
    schema = wiki.schema("locations")
    raw = {}
    for row in wiki.export("locations", schema):
        record = normalize_row(row, schema)
        record["region"] = LOCATION_ALIASES.get(record["region"], record["region"])
        raw[record["name"]] = record
    for name, act in EXTRA_ROOTS.items():
        raw.setdefault(name, {"page": name, "name": name, "act": act, "region": None, "summary": None})

    def chain(name: str) -> list[str]:
        path, seen = [], set()
        while name and name not in seen:
            if name not in raw:
                raise RuntimeError(f"Unknown parent region {name!r}; add an alias or extra root")
            seen.add(name)
            path.append(name)
            parent = raw[name]["region"]
            name = None if parent == name else parent
        return list(reversed(path))

    return {
        name: {
            "name": name,
            "act": rec["act"],
            "parent": rec["region"] if rec["region"] != name else None,
            "path": chain(name),
            "summary": rec["summary"],
            "wiki_url": wiki_url(rec["page"]),
        }
        for name, rec in raw.items()
    }


def build_acquisitions(wiki: WikiClient, items: dict, locations: dict, region_order: dict) -> tuple[list[dict], int]:
    """One record per item_locations row for a gear item, placed on the timeline."""
    act_rank = {act: i for i, act in enumerate(region_order["acts"])}
    schema = wiki.schema("item_locations")
    rows = wiki.export("item_locations", schema)
    acquisitions, skipped, unordered = [], 0, set()
    for row in rows:
        record = normalize_row(row, schema)
        if record["page"] not in items:
            skipped += 1
            continue
        _, links = clean_wikitext(row.get("description"))
        place = LOCATION_ALIASES.get(record["location"], record["location"])
        entry = {
            "item": record["page"],
            "uid": record["uid"],
            "description": record["description"],
            "links": links,
            "location": place,
            "path": None,
            "act": None,
            "zone": None,
            "order": None,
            "x": record["x"],
            "y": record["y"],
        }
        if place is not None:
            if place not in locations:
                raise RuntimeError(f"{record['page']}: unknown location {place!r}; add an alias")
            loc = locations[place]
            zones = region_order["zones"][loc["act"]]
            zone = next((p for p in reversed(loc["path"]) if p in zones), None)
            if zone is None:
                unordered.add((loc["act"], " > ".join(loc["path"])))
            else:
                entry.update(
                    path=loc["path"],
                    act=loc["act"],
                    zone=zone,
                    order=act_rank[loc["act"]] * 1000 + zones.index(zone),
                )
        acquisitions.append(entry)
    if unordered:
        listing = "\n  ".join(f"[{a}] {p}" for a, p in sorted(unordered))
        raise RuntimeError(f"Places missing from region_order.json:\n  {listing}")
    return acquisitions, skipped


def write_json(name: str, payload: Any) -> None:
    (DATA_DIR / name).write_text(json.dumps(payload, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--refresh", action="store_true", help="re-download from bg3.wiki instead of using cache/wiki/")
    args = parser.parse_args()

    wiki = WikiClient(CACHE_DIR, refresh=args.refresh)
    region_order = json.loads((DATA_DIR / "region_order.json").read_text(encoding="utf-8"))
    items = build_items(wiki)
    locations = build_locations(wiki)
    acquisitions, skipped = build_acquisitions(wiki, items, locations, region_order)

    located = {a["item"] for a in acquisitions}
    for item in items.values():
        item["has_location_data"] = item["id"] in located

    write_json("items.json", sorted(items.values(), key=lambda i: i["id"]))
    write_json("acquisitions.json", acquisitions)
    write_json("locations.json", sorted(locations.values(), key=lambda loc: loc["name"]))
    write_json(
        "meta.json",
        {
            "snapshot_utc": wiki.oldest_fetch.isoformat(timespec="seconds"),
            "source": WIKI,
            "source_tables": [*GEAR_TABLES, "item_locations", "locations"],
            "license": "Content from bg3.wiki, CC BY-NC-SA 4.0 or CC BY-SA 4.0",
            "license_url": f"{WIKI}/wiki/bg3wiki:Copyrights",
            "counts": {
                "items": len(items),
                "items_by_kind": {k: sum(1 for i in items.values() if i["kind"] == k) for k in GEAR_TABLES.values()},
                "items_without_location_data": sum(1 for i in items.values() if not i["has_location_data"]),
                "acquisitions": len(acquisitions),
                "acquisitions_without_place": sum(1 for a in acquisitions if a["location"] is None),
                "item_location_rows_skipped_non_gear": skipped,
                "locations": len(locations),
            },
        },
    )
    print(json.dumps(json.loads((DATA_DIR / "meta.json").read_text(encoding="utf-8"))["counts"], indent=1))
    print(f"{wiki.network_requests} requests to bg3.wiki; snapshot from {wiki.oldest_fetch:%Y-%m-%d %H:%M} UTC")
    return 0


if __name__ == "__main__":
    sys.exit(main())
