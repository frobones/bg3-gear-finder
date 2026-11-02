"""Unit tests for the pure helpers in scripts/fetch_wiki.py (no network)."""

import email.message
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


class FileUrlTest(unittest.TestCase):
    def test_matches_mediawiki_hashed_path(self) -> None:
        # Path observed on bg3.wiki for this file.
        self.assertEqual(
            fetch_wiki.file_url("File:Portrait Uktar.png"),
            "https://bg3.wiki/w/images/4/44/Portrait_Uktar.png",
        )


if __name__ == "__main__":
    unittest.main()
