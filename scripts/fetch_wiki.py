"""Snapshot gear data from bg3.wiki's Cargo tables (plus each item page's notes) into static JSON files.

Run by hand; the webpage only ever reads data/.

    python3 scripts/fetch_wiki.py            # rebuild data/ from cache/wiki/, fetching only what is missing
    python3 scripts/fetch_wiki.py --refresh  # re-download everything from bg3.wiki first

Reads data/region_order.json and data/party/ (both hand-maintained) and writes
items.json, acquisitions.json, locations.json, abilities.json and meta.json
into data/. abilities.json also holds the spells and features party profiles name.
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

# Ability tables, the kind recorded for them, and the item fields that name their pages.
ABILITY_TABLES = {
    "passives": ("passive", ("passives", "weapon_passives", "passives_main_hand", "passives_off_hand")),
    "actions": ("action", ("weapon_actions", "special_weapon_actions")),
}
ABILITY_FIELDS = (
    "name",
    "type",
    "brief",
    "description",
    "extra_description",
    "recharge",
    "cost",
    "image",
    "icon",
    "hotbar_icon",
)

# Party profiles are hand-written (data/party/); these keys name wiki pages the page shows as pop-outs or items.
PARTY_DIR = DATA_DIR / "party"
PROFILE_ABILITY_KEYS = ("abilities", "replace", "scribe", "hold")
PROFILE_ITEM_KEYS = ("item", "items", "alternates")
# Tables searched for a profile's ability names, in order, and the kind recorded for each.
PROFILE_ABILITY_TABLES = {"spells": "spell", "passives": "passive"}
SPELL_FIELDS = (
    "name",
    "brief",
    "description",
    "extra_description",
    "spell_level",
    "spell_school",
    "is_concentration",
    "is_ritual",
    "action_type",
    "spell_range",
    "recharge",
    "image",
    "icon",
)

# Item notes live only in each page's template source ("| notes = ..."), not in Cargo.
PAGES_PER_QUERY = 50  # api.php's limit on titles per request for anonymous users
EXPAND_BATCH_CHARS = 20_000  # notes are expanded together, in POSTs of about this size
NOTE_MARKER = "⟦note-{}⟧"  # survives template expansion; splits a batch back into its notes
NOTE_SPLIT = re.compile(r"⟦note-(\d+)⟧\n?")

# File/Category links may nest one ordinary link in their alt text: [[File:x.png|alt=Recharge: [[Long rest]]]]
FILE_LINK = re.compile(r"\[\[(?:File|Category):(?:[^\[\]]|\[\[[^\]]*\]\])*\]\]")
WIKI_LINK = re.compile(r"\[\[([^\]|]+)(?:\|([^\]]*))?\]\]")
SUP = re.compile(r"<sup\b.*?</sup>", re.S)
REF = re.compile(r"<ref\b[^>]*/>|<ref\b[^>]*>.*?</ref>", re.S | re.I)
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

    def get_json(self, name: str, url: str, form: dict | None = None) -> Any:
        """Return the cached response for `name`, fetching `url` first if needed (POSTing `form` if given)."""
        path = self.cache_dir / f"{name}.json"
        if self.refresh or not path.exists():
            self.cache_dir.mkdir(parents=True, exist_ok=True)
            payload = {"fetched_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"), "url": url}
            payload["data"] = self._fetch(url, form)
            path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        cached = json.loads(path.read_text(encoding="utf-8"))
        fetched = datetime.fromisoformat(cached["fetched_utc"])
        self.oldest_fetch = fetched if self.oldest_fetch is None else min(self.oldest_fetch, fetched)
        return cached["data"]

    def _fetch(self, url: str, form: dict | None) -> Any:
        """Fetch JSON politely: one request per second, retrying 429/5xx with Retry-After or backoff."""
        body = urllib.parse.urlencode(form).encode() if form else None
        request = urllib.request.Request(url, data=body, headers={"User-Agent": USER_AGENT})
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
        # The field list is part of the cache name, so asking for different fields never reuses a narrower export.
        digest = hashlib.sha256(",".join(fields).encode()).hexdigest()[:8]
        rows = self.get_json(f"{table}.rows.{digest}", f"{EXPORT}&{query}")
        if len(rows) >= ROW_LIMIT:
            raise RuntimeError(f"{table}: export hit the {ROW_LIMIT}-row limit; add paging")
        return [{key.replace(" ", "_"): value for key, value in row.items()} for row in rows]

    def api(self, kind: str, form: dict) -> Any:
        """POST to api.php, cached under a digest of the request so a changed request is fetched again."""
        digest = hashlib.sha256(json.dumps(form, sort_keys=True).encode()).hexdigest()[:16]
        return self.get_json(f"{kind}.{digest}", API, form={**form, "format": "json", "formatversion": "2"})


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
    # Word joiners (U+2060) flank removed icons, as in "1d4 [fire icon] Fire"; treat them as spaces.
    line = re.sub(r"[\s\u00a0\u202f\u2060]+", " ", line).strip()
    if line[:1] in "*#:;" and line:
        line = "• " + line.lstrip("*#:; ")
    return line


def clean_wikitext(raw: str | None) -> tuple[str | None, list[dict]]:
    """Reduce rendered-ish wikitext to plain text (one entry per line) plus the wiki links it contained."""
    if not raw:
        return None, []
    text = unescape(raw)
    text = SUP.sub("", text)
    text = REF.sub("", text)
    text = ABBR.sub(r"\1", text)
    text = FILE_LINK.sub("", text)
    links: list[dict] = []

    def replace_link(match: re.Match) -> str:
        target, label = match.group(1).strip(), match.group(2)
        label = TAG.sub("", label if label is not None else target).strip()  # e.g. [[Fire|<span ...>Fire</span>]]
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


def _ability(record: dict, kind: str, links: list[dict]) -> dict:
    """The pop-out record for one normalized passives/actions/spells row."""
    ability = {
        "id": record["page"],
        "kind": kind,
        "name": record["name"] or record["page"],
        "type": record.get("type"),
        "brief": record.get("brief"),
        "description": record.get("description"),
        "extra_description": record.get("extra_description"),
        "recharge": record.get("recharge"),
        "cost": record.get("cost"),
        "icon_url": record.get("icon_url") or record.get("image_url") or record.get("hotbar_icon_url"),
        "links": links,
        "wiki_url": wiki_url(record["page"]),
    }
    if kind == "spell":
        level = record.get("spell_level")
        ability.update(
            spell_level=int(level) if level is not None else None,
            school=record.get("spell_school"),
            concentration=record.get("is_concentration"),
            ritual=record.get("is_ritual"),
            action_type=record.get("action_type"),
            range=record.get("spell_range"),
        )
    return ability


def _table_rows(wiki: WikiClient, table: str, fields: tuple[str, ...]) -> tuple[dict, list[dict]]:
    full_schema = wiki.schema(table)
    schema = {field: full_schema[field] for field in fields if field in full_schema}
    return schema, wiki.export(table, schema)


def build_abilities(wiki: WikiClient, items: dict) -> dict[str, dict]:
    """Passives and weapon actions that items grant, keyed by wiki page name, for the item panel's pop-outs."""
    abilities: dict[str, dict] = {}
    for table, (kind, item_fields) in ABILITY_TABLES.items():
        wanted = {
            name
            for item in items.values()
            for record in (item, *item["variants"])
            for field in item_fields
            for name in record.get(field) or []
        }
        schema, rows = _table_rows(wiki, table, ABILITY_FIELDS)
        for row in rows:
            record = normalize_row(row, schema)
            if record["page"] not in wanted:
                continue
            _, links = clean_wikitext(row.get("description"))
            abilities[record["page"]] = _ability(record, kind, links)
            wanted.discard(record["page"])
        if wanted:
            raise RuntimeError(f"Items name {table} that bg3.wiki has no row for: {sorted(wanted)}")
    return abilities


def load_profiles() -> list[dict]:
    """Every filled-in party profile named in data/party/party.json."""
    roster = json.loads((PARTY_DIR / "party.json").read_text(encoding="utf-8"))
    return [
        json.loads((PARTY_DIR / f"{member['profile']}.json").read_text(encoding="utf-8"))
        for member in roster["members"]
        if "profile" in member
    ]


def profile_names(node: Any, keys: tuple[str, ...]) -> set[str]:
    """Every string a profile stores under one of `keys`, at any depth."""
    if isinstance(node, list):
        return set().union(*(profile_names(child, keys) for child in node))
    if not isinstance(node, dict):
        return set()
    found: set[str] = set()
    for key, value in node.items():
        if key in keys:
            found.update([value] if isinstance(value, str) else value)
        else:
            found |= profile_names(value, keys)
    return found


def check_profile_items(profiles: list[dict], items: dict) -> None:
    """Stop the build if a profile names an item the snapshot doesn't have, rather than dropping it silently."""
    for profile in profiles:
        unknown = profile_names(profile, PROFILE_ITEM_KEYS) - items.keys()
        if unknown:
            raise RuntimeError(f"Profile {profile['id']} names items bg3.wiki has no page for: {sorted(unknown)}")


def add_profile_abilities(wiki: WikiClient, profiles: list[dict], abilities: dict[str, dict]) -> None:
    """Add the spells, powers and features that profiles name, so the level-up view can explain them."""
    wanted = set().union(*(profile_names(p, PROFILE_ABILITY_KEYS) for p in profiles)) - abilities.keys()
    for table, kind in PROFILE_ABILITY_TABLES.items():
        schema, rows = _table_rows(wiki, table, SPELL_FIELDS if kind == "spell" else ABILITY_FIELDS)
        for row in rows:
            record = normalize_row(row, schema)
            if record["page"] not in wanted:
                continue
            _, links = clean_wikitext(row.get("description"))
            abilities[record["page"]] = _ability(record, kind, links)
            wanted.discard(record["page"])
    if wanted:
        raise RuntimeError(f"Profiles name spells or features bg3.wiki has no page for: {sorted(wanted)}")


def _store_template_fields(fields: list[str], params: dict[str, str]) -> None:
    for field in fields[1:]:  # fields[0] is the template name
        name, sep, value = field.partition("=")
        if sep:
            params.setdefault(name.strip().lower(), value.strip())


def template_params(wikitext: str) -> dict[str, str]:
    """Named parameters of the page's top-level templates; the first template to set a name wins.

    Splits on "|" only outside nested {{templates}} and [[links]], as MediaWiki does.
    """
    params: dict[str, str] = {}
    braces = links = 0
    field_start = 0
    fields: list[str] = []
    i = 0
    while i < len(wikitext):
        pair = wikitext[i : i + 2]
        if pair == "{{":
            braces += 1
            if braces == 1:
                field_start, fields = i + 2, []
            i += 2
        elif pair == "}}" and braces:
            if braces == 1:
                fields.append(wikitext[field_start:i])
                _store_template_fields(fields, params)
            braces -= 1
            i += 2
        elif pair == "[[":
            links += 1
            i += 2
        elif pair == "]]" and links:
            links -= 1
            i += 2
        else:
            if wikitext[i] == "|" and braces == 1 and links == 0:
                fields.append(wikitext[field_start:i])
                field_start = i + 1
            i += 1
    return params


def fetch_page_sources(wiki: WikiClient, titles: list[str]) -> dict[str, str]:
    """Current wikitext of each page, fetched PAGES_PER_QUERY titles at a time."""
    sources: dict[str, str] = {}
    for start in range(0, len(titles), PAGES_PER_QUERY):
        batch = titles[start : start + PAGES_PER_QUERY]
        form = {
            "action": "query",
            "prop": "revisions",
            "rvprop": "content",
            "rvslots": "main",
            "titles": "|".join(batch),
        }
        for page in wiki.api("pages", form)["query"]["pages"]:
            if "revisions" in page:
                sources[page["title"]] = page["revisions"][0]["slots"]["main"]["content"]
    if missing := sorted(set(titles) - sources.keys()):
        raise RuntimeError(f"bg3.wiki returned no source for: {missing}")
    return sources


def expand_templates(wiki: WikiClient, texts: dict[str, str]) -> dict[str, str]:
    """Expand wiki templates in many snippets using a few batched expandtemplates calls."""
    batches: list[list[str]] = [[]]
    size = 0
    for key in sorted(texts):
        if batches[-1] and size + len(texts[key]) > EXPAND_BATCH_CHARS:
            batches.append([])
            size = 0
        batches[-1].append(key)
        size += len(texts[key])

    expanded: dict[str, str] = {}
    for batch in filter(None, batches):
        text = "\n".join(f"{NOTE_MARKER.format(n)}\n{texts[key]}" for n, key in enumerate(batch))
        result = wiki.api("expand", {"action": "expandtemplates", "prop": "wikitext", "text": text})
        pieces = NOTE_SPLIT.split(result["expandtemplates"]["wikitext"])
        parts = {int(pieces[n]): pieces[n + 1] for n in range(1, len(pieces) - 1, 2)}
        if sorted(parts) != list(range(len(batch))):
            raise RuntimeError("Template expansion lost a note marker; lower EXPAND_BATCH_CHARS")
        expanded.update({key: parts[n] for n, key in enumerate(batch)})
    return expanded


def add_notes(wiki: WikiClient, items: dict[str, dict]) -> None:
    """Attach each page's `notes` template field to its item as plain text plus links."""
    sources = fetch_page_sources(wiki, sorted(items))
    raw_notes = {page: notes for page, src in sources.items() if (notes := template_params(src).get("notes"))}
    expanded = expand_templates(wiki, raw_notes)
    for page, item in items.items():
        if clash := {"notes", "notes_links"} & item.keys():
            raise RuntimeError(f"{page}: Cargo already has fields {sorted(clash)}")
        item["notes"], item["notes_links"] = clean_wikitext(expanded.get(page))


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
    abilities = build_abilities(wiki, items)
    profiles = load_profiles()
    check_profile_items(profiles, items)
    add_profile_abilities(wiki, profiles, abilities)
    add_notes(wiki, items)

    located = {a["item"] for a in acquisitions}
    for item in items.values():
        item["has_location_data"] = item["id"] in located

    write_json("items.json", sorted(items.values(), key=lambda i: i["id"]))
    write_json("acquisitions.json", acquisitions)
    write_json("locations.json", sorted(locations.values(), key=lambda loc: loc["name"]))
    write_json("abilities.json", sorted(abilities.values(), key=lambda a: a["id"]))
    write_json(
        "meta.json",
        {
            "snapshot_utc": wiki.oldest_fetch.isoformat(timespec="seconds"),
            "source": WIKI,
            "source_tables": [*GEAR_TABLES, "item_locations", "locations", *ABILITY_TABLES, *PROFILE_ABILITY_TABLES],
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
                "items_with_notes": sum(1 for i in items.values() if i["notes"]),
                "abilities_by_kind": {
                    kind: sum(1 for a in abilities.values() if a["kind"] == kind)
                    for kind in sorted({a["kind"] for a in abilities.values()})
                },
            },
        },
    )
    print(json.dumps(json.loads((DATA_DIR / "meta.json").read_text(encoding="utf-8"))["counts"], indent=1))
    print(f"{wiki.network_requests} requests to bg3.wiki; snapshot from {wiki.oldest_fetch:%Y-%m-%d %H:%M} UTC")
    return 0


if __name__ == "__main__":
    sys.exit(main())
