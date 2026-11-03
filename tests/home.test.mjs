// Unit tests for Home and its banner. Run with: node --test tests/

import assert from "node:assert/strict";
import test from "node:test";

import { bannerShots } from "../assets/js/banner.js";
import { homeHtml, latestSession, pageTitle, partyNameHtml } from "../assets/js/home.js";

const shot = (file, taken, banner = false) => ({ file, taken, caption: file, banner });
const shots = [
  shot("a", "2026-10-25T20:03:56", true),
  shot("b", "2026-11-01T20:00:00"),
  shot("c", "2026-11-01T20:10:00", true),
  shot("d", "2026-11-01T20:20:00"),
  shot("e", "2026-11-01T20:30:00"),
  shot("f", "2026-11-01T20:40:00"),
];
const data = { party: { members: [], profiles: new Map() } };

test("partyNameHtml shows a marked placeholder until the party has a name", () => {
  assert.match(partyNameHtml(null), /<span class="party-name-placeholder">Party name<\/span> <span class="placeholder-tag">to come<\/span>/);
  assert.equal(partyNameHtml("The <Brave>"), "The &lt;Brave&gt;");
});

test("pageTitle uses the party name once there is one", () => {
  assert.equal(pageTitle(null), "Our Baldur's Gate 3 party");
  assert.equal(pageTitle("The Brave"), "The Brave: Baldur's Gate 3");
});

test("latestSession takes the last four shots of the newest day, in time order", () => {
  const latest = latestSession(shots);
  assert.equal(latest.day, "2026-11-01");
  assert.deepEqual(
    latest.shots.map((s) => s.file),
    ["c", "d", "e", "f"],
  );
  assert.equal(latestSession([]), null);
});

test("homeHtml numbers Home's thumbnails by their place in the album viewer", () => {
  const html = homeHtml(shots, data);
  assert.match(html, /Last session: November 1, 2026/);
  // The viewer runs newest day first: b=0, c=1, d=2, e=3, f=4, then a=5.
  assert.match(html, /data-shot="1">\s*<img src="assets\/album\/thumbs\/c.jpg"/);
  assert.match(html, /data-shot="4">\s*<img src="assets\/album\/thumbs\/f.jpg"/);
  assert.match(html, /href="#album">See the whole album/);
  assert.match(homeHtml([], data), /No screenshots yet/);
});

test("bannerShots uses the marked shots, newest session first, or every shot when none are marked", () => {
  assert.deepEqual(
    bannerShots(shots).map((s) => s.file),
    ["c", "a"],
  );
  assert.deepEqual(
    bannerShots(shots.map((s) => ({ ...s, banner: false }))).map((s) => s.file),
    ["b", "c", "d", "e", "f", "a"],
  );
});
