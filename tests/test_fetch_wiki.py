"""Unit tests for the pure helpers in scripts/fetch_wiki.py (no network)."""

import email.message
import json
import re
import sys
import unittest
import urllib.error
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

import fetch_wiki  # noqa: E402 -- scripts/ is not a package; path is set up above


class CleanWikitextTest(unittest.TestCase):
    def test_strips_icon_markup_and_keeps_links(self) -> None:
        raw = (
            "Given by &lt;span class=&quot;bg3wiki-icontext-icon nowrap&quot; &gt;&lt;span "
            "class=&quot;bg3wiki-hidden-code&quot;&gt;&lt;\\/span&gt;[[File:Portrait Akabi.png|x25px|link=Akabi|"
            "alt=Akabi|class=bg3wiki-icon]]&lt;\\/span&gt;&amp;#8239;[[Akabi|Akabi]] at the "
            "[[Circus_of_the_Last_Days#Layout|Wheel of Fortune]][[Category:Pages with an explicit charlink alias]]"
        )
        text, links = fetch_wiki.clean_wikitext(raw)
        self.assertEqual(text, "Given by Akabi at the Wheel of Fortune")
        self.assertEqual([link["page"] for link in links], ["Akabi", "Circus of the Last Days"])
        self.assertEqual(links[1]["url"], "https://bg3.wiki/wiki/Circus_of_the_Last_Days#Layout")

    def test_bare_link_uses_target_as_text(self) -> None:
        text, links = fetch_wiki.clean_wikitext("Received from [[Mattis]] at his stall")
        self.assertEqual(text, "Received from Mattis at his stall")
        self.assertEqual(links, [{"text": "Mattis", "page": "Mattis", "url": "https://bg3.wiki/wiki/Mattis"}])

    def test_drops_footnotes_and_emphasis(self) -> None:
        text, _ = fetch_wiki.clean_wikitext("'''Rare''' drop<sup>[1]</sup> only")
        self.assertEqual(text, "Rare drop only")

    def test_nested_link_in_file_alt_and_abbr_and_lines(self) -> None:
        raw = (
            "<dl>\n<dt>[[File:Fly Icon.webp|40x40px|link=Fly|alt=Fly|class=bg3wiki-icon]] [[Fly (bonus action)|Fly]] "
            '(<abbr title="Bonus Action"><span>[[File:Bonus Action Icon.png|link=|alt=Bonus Action]]</span></abbr>)'
            "</dt>\n<dd>Recharge: ([[File:Recharge Icons.png|x25px|link=|alt=Recharge: [[Long rest]]|class=x]]"
            " [[Long rest]].)</dd>\n</dl>"
        )
        text, links = fetch_wiki.clean_wikitext(raw)
        self.assertEqual(text, "Fly (Bonus Action)\nRecharge: ( Long rest.)")
        self.assertEqual([link["page"] for link in links], ["Fly (bonus action)", "Long rest"])

    def test_bullets_and_wiki_table(self) -> None:
        raw = '* [[Performance]] +1\nIt reads;\n{| style="x"\n|-\n| style="color: red" | \'Dance forever.\'\n|}'
        text, _ = fetch_wiki.clean_wikitext(raw)
        self.assertEqual(text, "• Performance +1\nIt reads;\n'Dance forever.'")

    def test_empty_input(self) -> None:
        self.assertEqual(fetch_wiki.clean_wikitext(None), (None, []))
        self.assertEqual(fetch_wiki.clean_wikitext("<span></span>"), (None, []))


class ToBoolTest(unittest.TestCase):
    def test_cargo_flags(self) -> None:
        self.assertIs(fetch_wiki.to_bool("1"), True)
        self.assertIs(fetch_wiki.to_bool("0"), False)
        self.assertIs(fetch_wiki.to_bool(1), True)
        self.assertIs(fetch_wiki.to_bool(0), False)
        self.assertIsNone(fetch_wiki.to_bool(None))

    def test_rejects_unexpected_value(self) -> None:
        with self.assertRaises(ValueError):
            fetch_wiki.to_bool("yes")


def _http_error(code: int, retry_after: str | None = None) -> urllib.error.HTTPError:
    headers = email.message.Message()
    if retry_after is not None:
        headers["Retry-After"] = retry_after
    return urllib.error.HTTPError("https://bg3.wiki/x", code, "error", headers, None)


class RetryDelayTest(unittest.TestCase):
    def test_client_errors_are_not_retried(self) -> None:
        with self.assertRaises(urllib.error.HTTPError):
            fetch_wiki._retry_delay(1, _http_error(404))

    def test_rate_limit_honours_retry_after(self) -> None:
        self.assertEqual(fetch_wiki._retry_delay(1, _http_error(429, "30")), 30.0)

    def test_retry_after_is_capped(self) -> None:
        self.assertEqual(fetch_wiki._retry_delay(1, _http_error(429, "9999")), fetch_wiki.MAX_RETRY_AFTER_S)

    def test_server_error_backs_off_exponentially(self) -> None:
        self.assertTrue(8 <= fetch_wiki._retry_delay(3, _http_error(503)) < 9)

    def test_connection_error_backs_off(self) -> None:
        self.assertTrue(2 <= fetch_wiki._retry_delay(1, urllib.error.URLError("reset")) < 3)


class FakeWiki:
    """Stands in for WikiClient with canned Cargo rows, so no network is used."""

    SCHEMA = {
        "name": {"type": "String"},
        "description": {"type": "Wikitext"},
        "recharge": {"type": "String"},
        "image": {"type": "File"},
    }

    def __init__(self, rows: dict[str, list[dict]]) -> None:
        self.rows = rows

    def schema(self, table: str) -> dict:
        return self.SCHEMA

    def export(self, table: str, schema: dict) -> list[dict]:
        return self.rows[table]


def _item(**fields: list[str]) -> dict:
    return {"variants": [], **fields}


class BuildAbilitiesTest(unittest.TestCase):
    def test_keeps_only_abilities_items_use(self) -> None:
        wiki = FakeWiki(
            {
                "passives": [
                    {"_pageName": "Remedial Rhymes", "name": "Remedial Rhymes", "description": "Gain [[Temp HP]]."},
                    {"_pageName": "Unused", "name": "Unused", "description": "Nobody has this."},
                ],
                "actions": [{"_pageName": "Lacerate", "name": "Lacerate", "image": "Lacerate.webp"}],
            }
        )
        items = {"Blazer": _item(passives=["Remedial Rhymes"]), "Sword": _item(weapon_actions=["Lacerate"])}
        abilities = fetch_wiki.build_abilities(wiki, items)
        self.assertEqual(sorted(abilities), ["Lacerate", "Remedial Rhymes"])
        self.assertEqual(abilities["Remedial Rhymes"]["kind"], "passive")
        self.assertEqual(abilities["Remedial Rhymes"]["description"], "Gain Temp HP.")
        self.assertEqual(abilities["Remedial Rhymes"]["links"][0]["page"], "Temp HP")
        self.assertEqual(abilities["Lacerate"]["kind"], "action")
        self.assertEqual(abilities["Lacerate"]["icon_url"], fetch_wiki.file_url("Lacerate.webp"))

    def test_missing_ability_stops_the_build(self) -> None:
        wiki = FakeWiki({"passives": [], "actions": []})
        with self.assertRaisesRegex(RuntimeError, "Ghost Passive"):
            fetch_wiki.build_abilities(wiki, {"Ring": _item(passives=["Ghost Passive"])})


ROBE_SOURCE = """{{EquipmentPage
| description = {{very rare|Infernal Robe}} grants [[resistance|Resistance]] to fire.
| special = {{SpellAction|Fire Shield: Warm|level=4|recharge=Long Rest}}
| notes = * After recruiting {{CharLink|Wyll}}, kill {{CharLink|Karlach}}.
* Shares a model with the [[Selûnite Robe|Selûnite Robe]].
}}
==Gallery==
{{Other|notes=ignored}}"""


class TemplateParamsTest(unittest.TestCase):
    def test_reads_fields_with_nested_templates_and_links(self) -> None:
        params = fetch_wiki.template_params(ROBE_SOURCE)
        self.assertEqual(
            params["notes"],
            "* After recruiting {{CharLink|Wyll}}, kill {{CharLink|Karlach}}.\n"
            "* Shares a model with the [[Selûnite Robe|Selûnite Robe]].",
        )
        self.assertEqual(params["special"], "{{SpellAction|Fire Shield: Warm|level=4|recharge=Long Rest}}")
        self.assertEqual(params["description"], "{{very rare|Infernal Robe}} grants [[resistance|Resistance]] to fire.")

    def test_page_without_notes(self) -> None:
        self.assertNotIn("notes", fetch_wiki.template_params("{{WeaponPage|damage=1d6}}"))


class FakeApi:
    """Stands in for WikiClient.api: serves page sources and expands {{CharLink|X}} into a link."""

    def __init__(self, sources: dict[str, str]) -> None:
        self.sources = sources
        self.expand_calls = 0

    def api(self, kind: str, form: dict) -> dict:
        if form["action"] == "query":
            titles = form["titles"].split("|")
            pages = [
                {"title": t, "revisions": [{"slots": {"main": {"content": self.sources[t]}}}]}
                if t in self.sources
                else {"title": t, "missing": True}
                for t in titles
            ]
            return {"query": {"pages": pages}}
        self.expand_calls += 1
        expanded = re.sub(r"\{\{CharLink\|([^}]*)\}\}", r"<span>[[File:P.png|link=\1]]</span>[[\1|\1]]", form["text"])
        return {"expandtemplates": {"wikitext": expanded}}


class NotesTest(unittest.TestCase):
    def test_add_notes_expands_and_cleans_each_item(self) -> None:
        wiki = FakeApi({"Infernal Robe": ROBE_SOURCE, "Dagger": "{{WeaponPage|damage=1d4}}"})
        items = {"Infernal Robe": {"variants": []}, "Dagger": {"variants": []}}
        fetch_wiki.add_notes(wiki, items)
        self.assertEqual(
            items["Infernal Robe"]["notes"],
            "• After recruiting Wyll, kill Karlach.\n• Shares a model with the Selûnite Robe.",
        )
        self.assertEqual(
            [link["page"] for link in items["Infernal Robe"]["notes_links"]], ["Wyll", "Karlach", "Selûnite Robe"]
        )
        self.assertIsNone(items["Dagger"]["notes"])

    def test_missing_page_stops_the_build(self) -> None:
        with self.assertRaisesRegex(RuntimeError, "Ghost Ring"):
            fetch_wiki.add_notes(FakeApi({}), {"Ghost Ring": {"variants": []}})

    def test_expansion_is_batched_and_split_back_per_item(self) -> None:
        wiki = FakeApi({})
        texts = {f"Item {n:02}": f"Note {n} from {{{{CharLink|Npc{n}}}}}." + "x" * 5000 for n in range(10)}
        expanded = fetch_wiki.expand_templates(wiki, texts)
        self.assertGreater(wiki.expand_calls, 1)
        self.assertEqual(sorted(expanded), sorted(texts))
        self.assertTrue(expanded["Item 07"].startswith("Note 7 from <span>"))

    def test_link_labels_lose_html_and_refs_are_dropped(self) -> None:
        text, links = fetch_wiki.clean_wikitext('Deals [[Fire|<span class="x">Fire</span>]] damage<ref>Patch 6</ref>.')
        self.assertEqual(text, "Deals Fire damage.")
        self.assertEqual(links[0]["text"], "Fire")


class WordJoinerTest(unittest.TestCase):
    def test_word_joiners_around_removed_icons_become_a_space(self) -> None:
        text, _ = fetch_wiki.clean_wikitext("deals 1d4⁠[[File:Fire Damage Icon.png|20px]]⁠[[Fire]] damage")
        self.assertEqual(text, "deals 1d4 Fire damage")


class TableFakeWiki(FakeWiki):
    """FakeWiki whose rows differ per table, so lookup order between tables can be tested."""

    SCHEMA = {**FakeWiki.SCHEMA, "spell_level": {"type": "String"}}


class ProfileTest(unittest.TestCase):
    PROFILE = {
        "id": "rogue",
        "levels": [{"choices": [{"abilities": ["Shield (spell)"]}, {"replace": ["Sleep", "Magic Missile"]}]}],
        "scrolls": {"tiers": [{"scribe": ["Web"], "hold": []}], "no_scroll": [{"level": 3, "abilities": []}]},
        "gear": [{"item": "Ring", "priority": "core"}],
        "loadout": {"slots": [{"items": ["Ring"], "alternates": ["Boots"]}]},
        "illithid": {"powers": [{"abilities": ["Cull the Weak"]}]},
    }

    def test_profile_names_collects_every_listed_name(self) -> None:
        self.assertEqual(
            fetch_wiki.profile_names(self.PROFILE, fetch_wiki.PROFILE_ABILITY_KEYS),
            {"Shield (spell)", "Sleep", "Magic Missile", "Web", "Cull the Weak"},
        )
        self.assertEqual(fetch_wiki.profile_names(self.PROFILE, fetch_wiki.PROFILE_ITEM_KEYS), {"Ring", "Boots"})

    def test_unknown_item_stops_the_build(self) -> None:
        with self.assertRaisesRegex(RuntimeError, "Boots"):
            fetch_wiki.check_profile_items([self.PROFILE], {"Ring": {}})
        fetch_wiki.check_profile_items([self.PROFILE], {"Ring": {}, "Boots": {}})

    def test_spells_come_first_then_passives(self) -> None:
        wiki = TableFakeWiki(
            {
                "spells": [
                    {"_pageName": name, "name": name.replace(" (spell)", ""), "spell_level": 1}
                    for name in ("Shield (spell)", "Sleep", "Magic Missile", "Web")
                ],
                "passives": [{"_pageName": "Cull the Weak", "name": "Cull the Weak", "description": "Execute."}],
            }
        )
        abilities = {"Web": {"id": "Web", "kind": "action"}}
        fetch_wiki.add_profile_abilities(wiki, [self.PROFILE], abilities)
        self.assertEqual(abilities["Shield (spell)"]["name"], "Shield")
        self.assertEqual(abilities["Shield (spell)"]["kind"], "spell")
        self.assertEqual(abilities["Shield (spell)"]["spell_level"], 1)
        self.assertEqual(abilities["Cull the Weak"]["kind"], "passive")
        self.assertEqual(abilities["Web"]["kind"], "action", "an ability items already use is kept as is")

    def test_unknown_spell_stops_the_build(self) -> None:
        wiki = TableFakeWiki({"spells": [], "passives": []})
        with self.assertRaisesRegex(RuntimeError, "Cull the Weak"):
            fetch_wiki.add_profile_abilities(wiki, [self.PROFILE], {})


class PartyDataTest(unittest.TestCase):
    """The committed profiles must match the committed snapshot, or the page would show names it can't explain."""

    def test_profiles_name_only_snapshot_items_and_abilities(self) -> None:
        data = fetch_wiki.DATA_DIR
        items = {i["id"] for i in json.loads((data / "items.json").read_text(encoding="utf-8"))}
        abilities = {a["id"] for a in json.loads((data / "abilities.json").read_text(encoding="utf-8"))}
        for profile in fetch_wiki.load_profiles():
            with self.subTest(profile=profile["id"]):
                self.assertEqual(fetch_wiki.profile_names(profile, fetch_wiki.PROFILE_ITEM_KEYS) - items, set())
                self.assertEqual(fetch_wiki.profile_names(profile, fetch_wiki.PROFILE_ABILITY_KEYS) - abilities, set())


class FileUrlTest(unittest.TestCase):
    def test_matches_mediawiki_hashed_path(self) -> None:
        # Path observed on bg3.wiki for this file.
        self.assertEqual(
            fetch_wiki.file_url("File:Portrait Uktar.png"),
            "https://bg3.wiki/w/images/4/44/Portrait_Uktar.png",
        )


if __name__ == "__main__":
    unittest.main()
