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
  assert.deepEqual(picks.get("Body"), { picks: ["Breastplate"], others: ["Vest"], swaps: [] });
  assert.deepEqual(picks.get("Rings"), { picks: ["Ring A", "Ring B"], others: [], swaps: [] });
  assert.deepEqual(picks.get("Cloak"), { picks: [], others: [], swaps: [] });
});

test("slotPicks treats a friend's first item as the pick, or the first two for rings", () => {
  assert.deepEqual(slotPicks(pearl, "one").get("Rings"), { picks: ["Band", "Ring C"], others: [], swaps: [] });
  const three = { loadouts: [{ act: "one", slots: [{ slot: "Rings", items: ["A", "B", "C"] }, { slot: "Head", items: ["H", "I"] }] }] };
  assert.deepEqual(slotPicks(three, "one").get("Rings"), { picks: ["A", "B"], others: ["C"], swaps: [] });
  assert.deepEqual(slotPicks(three, "one").get("Head"), { picks: ["H"], others: ["I"], swaps: [] });
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
  assert.match(html, /<td><p class="gear-who"><span class="gear-who-portrait member-portrait-empty"><\/span><span>Vesper<\/span><\/p>/);
  assert.doesNotMatch(html, /Guest/);
  const actTwo = renderPartyGear(data, "two");
  assert.match(actTwo, /data-item="Cuirass"/);
  assert.doesNotMatch(actTwo, /data-item="Breastplate"/);
});

test("the overview has its own party route", () => {
  assert.deepEqual(parsePartyRoute(`#party/${PARTY_GEAR_ROUTE}`), { profileId: PARTY_GEAR_ROUTE, tab: null });
});

test("slotPicks puts swap-ins under their own group, never as a worn pick", () => {
  const friend = {
    gear: [{ item: "Pearl", tags: ["utility", "swap"] }, { item: "Misty" }],
    loadouts: [{ act: "one", slots: [{ slot: "Amulet", items: ["Pearl", "Misty", "Charm"] }] }],
  };
  assert.deepEqual(slotPicks(friend, "one").get("Amulet"), { picks: ["Misty"], others: ["Charm"], swaps: ["Pearl"] });
  const plan = {
    gear: [{ item: "Smuggler", priority: "swap" }],
    loadouts: [{ act: "one", slots: [{ slot: "Ring", items: ["Synergy"], alternates: ["Smuggler", "Infusion"] }] }],
  };
  assert.deepEqual(slotPicks(plan, "one").get("Rings"), { picks: ["Synergy"], others: ["Infusion"], swaps: ["Smuggler"] });
});

test("renderPartyGear labels swap-ins apart from alternates", () => {
  const swapper = {
    id: "zed",
    name: "Zed",
    title: "Warlock",
    gear: [{ item: "Ring C", tags: ["swap"] }],
    loadouts: [{ act: "one", label: "Act 1", slots: [{ slot: "Amulet", items: ["Band", "Ring C"] }] }],
  };
  const html = renderPartyGear({ ...data, party: { members: [{ profile: "zed" }], profiles: new Map([["zed", swapper]]) } }, "one");
  assert.match(html, /Swap in when needed<\/span><div class="loadout-item"><button[^>]*data-item="Ring C"/);
  assert.doesNotMatch(html, />Or</);
});

test("renderPartyGear puts each character's portrait and name in their cells for phones", () => {
  const face = { id: "zed", name: "Zed <Jr>", title: "Warlock", portrait: "assets/portraits/zed.jpg", loadouts: [] };
  face.loadouts = [{ act: "one", label: "Act 1", slots: [{ slot: "Head", items: ["Band"] }] }];
  const html = renderPartyGear({ ...data, party: { members: [{ profile: "zed" }], profiles: new Map([["zed", face]]) } }, "one");
  assert.match(html, /<p class="gear-who"><img class="gear-who-portrait" src="assets\/portraits\/zed.jpg" alt=""/);
  assert.match(html, /<span>Zed &lt;Jr&gt;<\/span><\/p>/);
});
