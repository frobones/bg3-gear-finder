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


# Items more than one person may list, and why: everything else has a single owner.
SHARED_ITEMS = {
    "Adamantine Shield": "the forge makes two Mithral items, and this is one of each",
    "Breastplate +1": "the Hollow's copy, and traders sell more",
    "Scale Mail +1": "traders sell it",
    "Cloak of Protection": "Alene passes it to Zetharis",
}

# Or choices deliberately left behind when the main pick stays the same: (profile, act, slot, item).
ORS_NOT_CARRIED = {
    ("vesper", "two", "Off hand", "Absolute's Warboard"),
    ("vesper", "three", "Ring", "Shadow Blade Ring"),
    ("vesper", "three", "Main hand", "Knife of the Undermountain King"),
    ("alene", "two", "Body", "The Protecty Sparkswall"),
    ("alene", "two", "Body", "Spidersilk Armour"),
    ("alene", "two", "Body", "The Oak Father's Embrace"),
    ("pearl", "two", "Ranged", "Heavy Crossbow +1"),
    ("pearl", "three", "Rings", "Caustic Band"),
}


def all_profiles() -> list[dict]:
    """Every character profile, full plans and friends' pages alike."""
    return [json.loads(path.read_text()) for path in PARTY_DIR.glob("*.json") if path.name != "party.json"]


def owned_items(profile: dict) -> set[str]:
    """What a profile plans to use: its loadouts and its gear, leaving out items it hands to someone else."""
    wanted = {entry["item"] for entry in profile["gear"] if entry.get("item") and entry.get("priority") != "yield"}
    return wanted | loadout_names(profile)


def items_with_several_owners(profiles: list[dict]) -> dict[str, list[str]]:
    """Each item more than one profile plans to use, with those profiles' ids."""
    owners: dict[str, list[str]] = {}
    for profile in profiles:
        for item in owned_items(profile):
            owners.setdefault(item, []).append(profile["id"])
    return {item: sorted(ids) for item, ids in owners.items() if len(ids) > 1}


def ors_dropped(profile: dict) -> set[tuple[str, str, str, str]]:
    """Or choices that vanish into the next act although the slot's main pick stays the same."""
    dropped = set()
    for earlier, later in zip(profile["loadouts"], profile["loadouts"][1:]):
        for slot in later["slots"]:
            options = slot.get("items", []) + slot.get("alternates", [])
            for previous in earlier["slots"]:
                previous_options = previous.get("items", []) + previous.get("alternates", [])
                if previous["slot"] == slot["slot"] and previous_options[:1] == options[:1]:
                    dropped |= {
                        (profile["id"], later["act"], slot["slot"], item)
                        for item in previous_options[1:]
                        if item not in options
                    }
    return dropped


class OwnershipTest(unittest.TestCase):
    def test_each_item_has_one_owner_unless_listed_as_shared(self) -> None:
        self.assertEqual(sorted(set(items_with_several_owners(all_profiles())) - set(SHARED_ITEMS)), [])

    def test_two_owners_are_detected(self) -> None:
        profile = {"gear": [{"item": "Ring"}], "loadouts": []}
        profiles = [{**profile, "id": "a"}, {**profile, "id": "b"}]
        self.assertEqual(items_with_several_owners(profiles), {"Ring": ["a", "b"]})

    def test_a_hand_off_is_not_ownership(self) -> None:
        profiles = [
            {"id": "a", "gear": [{"item": "Ring", "priority": "yield"}], "loadouts": []},
            {"id": "b", "gear": [{"item": "Ring"}], "loadouts": []},
        ]
        self.assertEqual(items_with_several_owners(profiles), {})


class CarryForwardTest(unittest.TestCase):
    def test_or_choices_follow_a_main_pick_into_the_next_act(self) -> None:
        dropped = set().union(*(ors_dropped(profile) for profile in all_profiles()))
        self.assertEqual(sorted(dropped - ORS_NOT_CARRIED), [])

    def test_every_listed_exception_is_still_needed(self) -> None:
        dropped = set().union(*(ors_dropped(profile) for profile in all_profiles()))
        self.assertEqual(sorted(ORS_NOT_CARRIED - dropped), [])

    def test_a_dropped_or_is_detected_only_when_the_main_pick_stays(self) -> None:
        def profile(later_main: str) -> dict:
            return {
                "id": "a",
                "loadouts": [
                    {"act": "one", "slots": [{"slot": "Head", "items": ["Hat", "Cap"]}]},
                    {"act": "two", "slots": [{"slot": "Head", "items": [later_main]}]},
                ],
            }

        self.assertEqual(ors_dropped(profile("Hat")), {("a", "two", "Head", "Cap")})
        self.assertEqual(ors_dropped(profile("Crown")), set())


class DontMissTest(unittest.TestCase):
    def test_warnings_name_a_planned_item_in_a_real_act(self) -> None:
        roster = json.loads((PARTY_DIR / "party.json").read_text())
        planned = set().union(*(owned_items(profile) for profile in all_profiles()))
        for entry in roster["dont_miss"]:
            with self.subTest(text=entry["text"]):
                self.assertTrue(entry["items"])
                self.assertLessEqual(set(entry["items"]), planned)
                self.assertIn(entry["act"], {"one", "two", "three"})

    def test_warnings_follow_play_order(self) -> None:
        roster = json.loads((PARTY_DIR / "party.json").read_text())
        order = json.loads((PARTY_DIR.parent / "region_order.json").read_text())
        places = [(act, zone) for act in ("one", "two", "three") for zone in order["zones"][act]]
        for entry in roster["dont_miss"]:
            with self.subTest(text=entry["text"]):
                self.assertIn((entry["act"], entry["zone"]), places)
        positions = [places.index((entry["act"], entry["zone"])) for entry in roster["dont_miss"]]
        self.assertEqual(positions, sorted(positions))


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
