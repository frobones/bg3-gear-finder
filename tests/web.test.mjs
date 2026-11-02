// Unit tests for the page's pure helpers. Run with: node --test tests/
import assert from "node:assert/strict";
import { test } from "node:test";

import { averageDamage } from "../assets/js/data.js";
import { esc, linkify, safeWikiUrl } from "../assets/js/html.js";
import { nextSort, sortItems } from "../assets/js/table.js";

test("esc neutralises HTML", () => {
  assert.equal(esc(`<img src=x onerror="a('b')">&`), "&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;");
  assert.equal(esc(null), "");
});

test("linkify links each link's first occurrence and escapes the rest", () => {
  const html = linkify("Sold by Dammon <b>in</b> the Hollow", [
    { text: "Dammon", url: "https://bg3.wiki/wiki/Dammon" },
    { text: "Hollow", url: "https://bg3.wiki/wiki/The_Hollow" },
  ]);
  assert.equal(
    html,
    'Sold by <a href="https://bg3.wiki/wiki/Dammon" target="_blank" rel="noopener">Dammon</a> &lt;b&gt;in&lt;/b&gt; the ' +
      '<a href="https://bg3.wiki/wiki/The_Hollow" target="_blank" rel="noopener">Hollow</a>',
  );
});

test("linkify refuses links that don't point at bg3.wiki", () => {
  assert.equal(linkify("Ask Mattis", [{ text: "Mattis", url: "javascript:alert(1)" }]), "Ask Mattis");
  assert.equal(safeWikiUrl("https://evil.example.com/bg3.wiki/"), null);
});

test("averageDamage handles dice, modifiers and missing values", () => {
  assert.equal(averageDamage("1d8 + 1"), 5.5);
  assert.equal(averageDamage("2d6"), 7);
  assert.equal(averageDamage("1d10 -1"), 4.5);
  assert.equal(averageDamage(null), null);
});

const item = (label, price) => ({ label, price, rarityRank: 0 });

test("sortItems keeps items without a value last in both directions", () => {
  const items = [item("A", null), item("B", 10), item("C", 500)];
  assert.deepEqual(
    sortItems(items, { key: "price", descending: true }).map((i) => i.label),
    ["C", "B", "A"],
  );
  assert.deepEqual(
    sortItems(items, { key: "price", descending: false }).map((i) => i.label),
    ["B", "C", "A"],
  );
});

test("nextSort flips the active column and starts value columns high", () => {
  assert.deepEqual(nextSort({ key: "price", descending: true }, "price"), { key: "price", descending: false });
  assert.deepEqual(nextSort({ key: "when", descending: false }, "price"), { key: "price", descending: true });
  assert.deepEqual(nextSort({ key: "price", descending: true }, "name"), { key: "name", descending: false });
});
