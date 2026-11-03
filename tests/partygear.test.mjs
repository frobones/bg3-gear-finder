// Unit tests for the party gear overview. Run with: node --test tests/
import assert from "node:assert/strict";
import { test } from "node:test";

import { parsePartyRoute } from "../assets/js/party.js";
import { PARTY_GEAR_ROUTE, partyActs, renderPartyGear, slotPicks } from "../assets/js/partygear.js";

const vesper = {
  id: "vesper",
  name: "Vesper",
  title: "Rogue",
  loadouts: [
    {
      act: "one",
      label: "Act 1",
      slots: [
        { slot: "Chest", items: ["Breastplate"], alternates: ["Vest"] },
        { slot: "Ring", items: ["Ring A"], alternates: [] },
        { slot: "Ring", items: ["Ring B"], alternates: ["Ring A"] },
        { slot: "Cloak", note: "Nothing yet." },
      ],
    },
  ],
};
const pearl = {
  id: "pearl",
  name: "Pearl",
  title: "Ranger",
  loadouts: [
    { act: "one", label: "Act 1", slots: [{ slot: "Rings", items: ["Band", "Ring C"] }] },
    { act: "two", label: "Act 2", slots: [{ slot: "Body", items: ["Cuirass"] }] },
  ],
};
const item = (id) => ({ id, label: id, rarity: "rare" });
const data = {
  byId: new Map(["Breastplate", "Vest", "Ring A", "Ring B", "Band", "Ring C", "Cuirass"].map((id) => [id, item(id)])),
  party: {
    members: [{ profile: "vesper" }, { name: "Guest" }, { profile: "pearl" }],
    profiles: new Map([
      ["vesper", vesper],
      ["pearl", pearl],
    ]),
  },
};

test("slotPicks merges Vesper's ring rows, maps Chest to Body, and keeps alternates apart", () => {
  const picks = slotPicks(vesper, "one");
  assert.deepEqual(picks.get("Body"), { picks: ["Breastplate"], others: ["Vest"] });
  assert.deepEqual(picks.get("Rings"), { picks: ["Ring A", "Ring B"], others: [] });
  assert.deepEqual(picks.get("Cloak"), { picks: [], others: [] });
});

test("slotPicks treats a friend's first item as the pick, or the first two for rings", () => {
  assert.deepEqual(slotPicks(pearl, "one").get("Rings"), { picks: ["Band", "Ring C"], others: [] });
  const three = { loadouts: [{ act: "one", slots: [{ slot: "Rings", items: ["A", "B", "C"] }, { slot: "Head", items: ["H", "I"] }] }] };
  assert.deepEqual(slotPicks(three, "one").get("Rings"), { picks: ["A", "B"], others: ["C"] });
  assert.deepEqual(slotPicks(three, "one").get("Head"), { picks: ["H"], others: ["I"] });
  assert.equal(slotPicks(pearl, "three").size, 0);
});

test("partyActs lists every act any profile plans, in play order", () => {
  assert.deepEqual(partyActs([pearl, vesper]), [
    { act: "one", label: "Act 1" },
    { act: "two", label: "Act 2" },
  ]);
});

test("renderPartyGear shows each character as a column for the chosen act", () => {
  const html = renderPartyGear(data, "one");
  assert.match(html, /href="#party\/vesper">Vesper/);
  assert.match(html, /href="#party\/pearl">Pearl/);
  assert.match(html, /data-loadout-act="one" aria-pressed="true"/);
  assert.match(html, /<th scope="row">Rings<\/th>/);
  assert.match(html, /data-item="Ring C"/);
  assert.match(html, /Nothing planned/);
  assert.doesNotMatch(html, /Guest/);
  const actTwo = renderPartyGear(data, "two");
  assert.match(actTwo, /data-item="Cuirass"/);
  assert.doesNotMatch(actTwo, /data-item="Breastplate"/);
});

test("the overview has its own party route", () => {
  assert.deepEqual(parsePartyRoute(`#party/${PARTY_GEAR_ROUTE}`), { profileId: PARTY_GEAR_ROUTE, tab: null });
});
