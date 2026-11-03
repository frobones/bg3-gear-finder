"""Build the site's photo album from the screenshots in album/.

Run by hand after adding screenshots:

    python3 scripts/build_album.py

For each Steam screenshot in album/ (named like 20261101202756_1.jpg), writes a display copy
to assets/album/ and a thumbnail to assets/album/thumbs/, then updates data/album.json.
Captions in data/album.json are hand-written and kept across rebuilds; new shots get an empty
caption to fill in. album/ holds the full-size originals and stays out of git.

Resizing uses sips, which comes with macOS.
"""

import json
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
SOURCE_DIR = ROOT / "album"
PHOTO_DIR = ROOT / "assets" / "album"
THUMB_DIR = PHOTO_DIR / "thumbs"
ALBUM_JSON = ROOT / "data" / "album.json"

PHOTO_MAX_PX = 1600
PHOTO_QUALITY = 80
THUMB_MAX_PX = 640
THUMB_QUALITY = 75
SIPS_TIMEOUT_S = 60

STEAM_NAME = re.compile(r"^(\d{14})_\d+$")


def taken_at(stem: str) -> str:
    """The time a Steam screenshot was taken, read from its file name, as ISO 8601 local time."""
    match = STEAM_NAME.match(stem)
    if not match:
        raise ValueError(
            f"{stem}.jpg isn't named like a Steam screenshot (20261101202756_1.jpg)"
        )
    return datetime.strptime(match.group(1), "%Y%m%d%H%M%S").isoformat()


def merge_shots(
    stems: list[str], previous: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """One entry per screenshot in time order, keeping the caption already written for each."""
    captions = {shot["file"]: shot["caption"] for shot in previous}
    shots = [
        {"file": stem, "taken": taken_at(stem), "caption": captions.get(stem, "")}
        for stem in stems
    ]
    return sorted(shots, key=lambda shot: (shot["taken"], shot["file"]))


def resize(source: Path, target: Path, max_px: int, quality: int) -> None:
    """Write a JPEG copy of `source` no larger than `max_px` on its longest side."""
    subprocess.run(
        [
            "sips",
            "-Z",
            str(max_px),
            "-s",
            "format",
            "jpeg",
            "-s",
            "formatOptions",
            str(quality),
            str(source),
            "--out",
            str(target),
        ],
        check=True,
        capture_output=True,
        timeout=SIPS_TIMEOUT_S,
    )


def is_current(source: Path, target: Path) -> bool:
    return target.exists() and target.stat().st_mtime >= source.stat().st_mtime


def main() -> int:
    """Resize new screenshots, drop copies of removed ones, and rewrite data/album.json."""
    sources = sorted(SOURCE_DIR.glob("*.jpg")) if SOURCE_DIR.is_dir() else []
    # A fresh clone has no album/ (it's gitignored); stop rather than empty the published album.
    if not sources:
        print(
            f"No screenshots in {SOURCE_DIR}. Add the .jpg files there and run this again."
        )
        return 1

    previous = (
        json.loads(ALBUM_JSON.read_text())["shots"] if ALBUM_JSON.exists() else []
    )
    try:
        shots = merge_shots([source.stem for source in sources], previous)
    except ValueError as error:
        print(error)
        return 1

    PHOTO_DIR.mkdir(parents=True, exist_ok=True)
    THUMB_DIR.mkdir(parents=True, exist_ok=True)
    for source in sources:
        for folder, max_px, quality in (
            (PHOTO_DIR, PHOTO_MAX_PX, PHOTO_QUALITY),
            (THUMB_DIR, THUMB_MAX_PX, THUMB_QUALITY),
        ):
            target = folder / source.name
            if not is_current(source, target):
                resize(source, target, max_px, quality)

    kept = {source.name for source in sources}
    for folder in (PHOTO_DIR, THUMB_DIR):
        for copy in folder.glob("*.jpg"):
            if copy.name not in kept:
                copy.unlink()

    ALBUM_JSON.write_text(
        json.dumps({"shots": shots}, indent=2, ensure_ascii=False) + "\n"
    )
    missing = sum(1 for shot in shots if not shot["caption"])
    print(
        f"{len(shots)} shots in the album"
        + (f", {missing} without a caption" if missing else "")
        + "."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
