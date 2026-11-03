"""Checks on the hand-written party profiles in data/party/."""

import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PARTY_DIR = ROOT / "data" / "party"


def full_plans() -> list[dict]:
    """Profiles with a full build plan (tabs and loadouts), not a friend's page of options."""
    profiles = [
        json.loads(path.read_text())
        for path in PARTY_DIR.glob("*.json")
        if path.name != "party.json"
    ]
    return [profile for profile in profiles if profile.get("style") != "options"]


def loadout_names(profile: dict) -> set[str]:
    """Every item any of the profile's act loadouts mentions."""
    names: set[str] = set()
    for loadout in profile["loadouts"]:
        for slot in loadout["slots"]:
            for key in ("items", "alternates"):
                names.update(slot.get(key, []))
    return names


class ChecklistCoverageTest(unittest.TestCase):
    def test_every_checklist_item_shows_in_an_act_loadout(self) -> None:
        # So nothing on the checklist is forgotten: each wanted item appears in at least one act tab.
        plans = full_plans()
        self.assertTrue(plans)
        for profile in plans:
            listed = loadout_names(profile)
            wanted = {
                entry.get("item") or entry["name"]
                for entry in profile["gear"]
                if entry.get("priority") != "yield"
            }
            with self.subTest(profile=profile["id"]):
                self.assertEqual(sorted(wanted - listed), [])


class PortraitFilesTest(unittest.TestCase):
    def test_every_portrait_a_profile_names_exists(self) -> None:
        profiles = [
            json.loads(path.read_text())
            for path in PARTY_DIR.glob("*.json")
            if path.name != "party.json"
        ]
        for profile in profiles:
            for key in ("portrait", "portrait_full"):
                if key in profile:
                    with self.subTest(profile=profile["id"], key=key):
                        self.assertTrue((ROOT / profile[key]).is_file(), profile[key])


if __name__ == "__main__":
    unittest.main()
