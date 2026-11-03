// Unit tests for the album page. Run with: node --test tests/

import assert from "node:assert/strict";
import test from "node:test";

import { albumHtml, dayLabel, groupByDay } from "../assets/js/album.js";

const shots = [
  { file: "20261025200356_1", taken: "2026-10-25T20:03:56", caption: "Meeting Lae'zel" },
  { file: "20261101202756_1", taken: "2026-11-01T20:27:56", caption: "" },
  { file: "20261101231925_1", taken: "2026-11-01T23:19:25", caption: "<b>Scratch</b>" },
];

test("groupByDay puts the newest session first and keeps each day in time order", () => {
  const days = groupByDay(shots);
  assert.deepEqual(
    days.map((d) => d.day),
    ["2026-11-01", "2026-10-25"],
  );
  assert.deepEqual(
    days[0].shots.map((s) => s.file),
    ["20261101202756_1", "20261101231925_1"],
  );
});

test("dayLabel spells out the date", () => {
  assert.equal(dayLabel("2026-11-01"), "November 1, 2026");
});

test("albumHtml numbers shots in display order and escapes captions", () => {
  const html = albumHtml(shots);
  assert.match(html, /November 1, 2026 <span class="row-sub">2 screenshots<\/span>/);
  assert.match(html, /October 25, 2026 <span class="row-sub">1 screenshot<\/span>/);
  assert.match(html, /data-shot="0">\s*<img src="assets\/album\/thumbs\/20261101202756_1.jpg"/);
  assert.match(html, /data-shot="2">\s*<img src="assets\/album\/thumbs\/20261025200356_1.jpg"/);
  assert.match(html, /<figcaption>&lt;b&gt;Scratch&lt;\/b&gt;<\/figcaption>/);
  assert.match(html, /alt="Screenshot from November 1, 2026"/);
});

test("albumHtml says how to add shots when the album is empty", () => {
  assert.match(albumHtml([]), /No screenshots yet/);
});
