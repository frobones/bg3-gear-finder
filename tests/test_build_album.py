"""Tests for scripts/build_album.py: dates from Steam file names, and captions kept across rebuilds."""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

import build_album  # noqa: E402 -- scripts/ is not a package; path is set up above


class TakenAtTest(unittest.TestCase):
    def test_reads_the_time_from_a_steam_name(self) -> None:
        self.assertEqual(
            build_album.taken_at("20261101202756_1"), "2026-11-01T20:27:56"
        )

    def test_rejects_other_names(self) -> None:
        with self.assertRaises(ValueError):
            build_album.taken_at("IMG_0001")


class MergeShotsTest(unittest.TestCase):
    def test_keeps_captions_and_adds_new_shots_in_time_order(self) -> None:
        previous = [
            {
                "file": "20261101202756_1",
                "taken": "2026-11-01T20:27:56",
                "caption": "Alene",
            }
        ]
        shots = build_album.merge_shots(
            ["20261101231925_1", "20261101202756_1", "20261025200356_1"], previous
        )
        self.assertEqual(
            [s["file"] for s in shots],
            ["20261025200356_1", "20261101202756_1", "20261101231925_1"],
        )
        self.assertEqual([s["caption"] for s in shots], ["", "Alene", ""])

    def test_drops_shots_no_longer_in_the_folder(self) -> None:
        previous = [
            {
                "file": "20261025200356_1",
                "taken": "2026-10-25T20:03:56",
                "caption": "Gone",
            }
        ]
        self.assertEqual(build_album.merge_shots([], previous), [])


if __name__ == "__main__":
    unittest.main()
