// Unit tests for the party profile helpers. Run with: node --test tests/
import assert from "node:assert/strict";
import { test } from "node:test";

import { abilityFacts, abilityName } from "../assets/js/abilities.js";
import { wantedByItem } from "../assets/js/data.js";
import { partyPlans } from "../assets/js/detail.js";
import { planGroups, renderGearTab } from "../assets/js/gearplan.js";
import { levelLearning } from "../assets/js/guides.js";
import { choiceSummary, choiceValue } from "../assets/js/levelup.js";
import { parsePartyRoute } from "../assets/js/party.js";
import { emptyProgress, sanitizeProgress, toggleInList } from "../assets/js/progress.js";

const abilities = new Map([
  ["Shield (spell)", { id: "Shield (spell)", kind: "spell", name: "Shield", spell_level: 1, action_type: "reaction" }],
  ["Sleep", { id: "Sleep", kind: "spell", name: "Sleep", spell_level: 1, school: "Enchantment" }],
  ["Magic Missile", { id: "Magic Missile", kind: "spell", name: "Magic Missile", spell_level: 1 }],
]);

test("parsePartyRoute reads the profile and tab, and drops unknown tabs", () => {
  assert.deepEqual(parsePartyRoute("#party"), { profileId: null, tab: null });
  assert.deepEqual(parsePartyRoute("#party/vesper/gear"), { profileId: "vesper", tab: "gear" });
  assert.deepEqual(parsePartyRoute("#party/vesper/nonsense"), { profileId: "vesper", tab: null });
  assert.equal(parsePartyRoute("#items"), null);
});

test("sanitizeProgress keeps well-formed fields and rejects the rest", () => {
  assert.deepEqual(sanitizeProgress(null), emptyProgress());
  assert.deepEqual(sanitizeProgress({ level: 13, tab: "<script>", got: ["Ring", 4], scribed: "Web" }), {
    ...emptyProgress(),
    got: ["Ring"],
  });
  assert.equal(sanitizeProgress({ level: 7, tab: "scrolls" }).level, 7);
  assert.equal(sanitizeProgress({ level: 2.5 }).level, 0);
});

test("toggleInList adds once and removes", () => {
  const added = toggleInList(emptyProgress(), "got", "Ring", true);
  assert.deepEqual(toggleInList(added, "got", "Ring", true).got, ["Ring"]);
  assert.deepEqual(toggleInList(added, "got", "Ring", false).got, []);
});

test("choiceValue shows a replacement with both spells as pop-out triggers", () => {
  const html = choiceValue({ label: "Replace spell", replace: ["Sleep", "Magic Missile"] }, abilities);
  assert.match(html, /data-ability="Sleep"/);
  assert.match(html, /→/);
  assert.match(html, /data-ability="Magic Missile"/);
  const optional = choiceValue({ label: "Replace", replace: ["Sleep", "Magic Missile"], text: "only if wanted" }, abilities);
  assert.match(optional, /<span class="muted">only if wanted<\/span>$/);
});

test("choiceValue escapes plain text and keeps names without wiki data as text", () => {
  assert.equal(choiceValue({ label: "Race", text: "<b>Tiefling</b>" }, abilities), "&lt;b&gt;Tiefling&lt;/b&gt;");
  assert.equal(abilityName("Unknown Spell", abilities), "Unknown Spell");
});

test("choiceSummary uses display names, not wiki page names", () => {
  const level = {
    choices: [
      { label: "Spells", abilities: ["Shield (spell)", "Sleep"] },
      { label: "Replace spell", replace: ["Sleep", "Magic Missile"] },
    ],
  };
  assert.equal(choiceSummary(level, abilities), "Spells: Shield, Sleep; Replace spell: Sleep → Magic Missile");
  assert.equal(choiceSummary({ choices: [] }, abilities), "No choices");
});

test("abilityFacts describes a spell by level, school and action", () => {
  assert.deepEqual(abilityFacts(abilities.get("Shield (spell)")), ["Level 1 spell", "Reaction"]);
  assert.deepEqual(abilityFacts({ kind: "spell", spell_level: 0, concentration: true }), ["Cantrip", "Concentration"]);
});

const byId = new Map([
  ["Late Ring", { id: "Late Ring", earliest: { act: "three", order: 3005 }, acquisitions: [{}] }],
  ["Early Boots", { id: "Early Boots", earliest: { act: "one", order: 1009 }, acquisitions: [{}] }],
  ["Camp Mask", { id: "Camp Mask", earliest: null, acquisitions: [] }],
  ["Crit Knife", { id: "Crit Knife", earliest: { act: "one", order: 1001 }, acquisitions: [{}] }],
]);

test("planGroups orders by where the wiki places each item and leaves yielded items out", () => {
  const gear = [
    { item: "Late Ring", priority: "core" },
    { item: "Early Boots", priority: "high" },
    { item: "Crit Knife", priority: "yield" },
    { item: "Camp Mask", priority: "swap" },
    { item: "Camp Mask", priority: "swap", act: "two" },
    { name: "Odd Stone", act: "two", priority: "matchup" },
  ];
  const groups = planGroups(gear, byId);
  assert.deepEqual(
    groups.map(([act, rows]) => [act, rows.map((r) => r.entry.item ?? r.entry.name)]),
    [
      ["one", ["Early Boots"]],
      ["two", ["Camp Mask", "Odd Stone"]],
      ["three", ["Late Ring"]],
      ["anywhere", ["Camp Mask"]],
    ],
  );
});

test("levelLearning finds the level whose choices learn a held-back spell", () => {
  const profile = { levels: [{ level: 6, choices: [] }, { level: 7, choices: [{ abilities: ["Fog Cloud"] }] }] };
  assert.equal(levelLearning(profile, "Fog Cloud"), 7);
  assert.equal(levelLearning(profile, "Web"), null);
});

test("wantedByItem and partyPlans show who plans around an item", () => {
  const profile = {
    id: "vesper",
    name: "Vesper",
    gear: [
      { item: "Late Ring", priority: "party", note: "Nice ring.", claim: "Druid first." },
      { name: "Odd Stone", priority: "matchup" },
    ],
  };
  const wanted = wantedByItem([profile]);
  assert.deepEqual([...wanted.keys()], ["Late Ring"]);
  const html = partyPlans(wanted.get("Late Ring"));
  assert.match(html, /href="#party\/vesper\/gear"/);
  assert.match(html, /Party decision/);
  assert.match(html, /Who gets it: Druid first\./);
  assert.equal(partyPlans([]), "");
});

test("renderGearTab shows the chosen act's loadout with its default and alternates", () => {
  const item = (id) => ({ id, label: id, rarity: "rare", earliest: null, acquisitions: [] });
  const data = { byId: new Map(["Guide Mail", "Wiki Vest", "Late Helm"].map((id) => [id, item(id)])), abilities };
  const profile = {
    gear: [
      { item: "Guide Mail", priority: "core" },
      { item: "Wiki Vest", priority: "optional" },
    ],
    loadouts: [
      { act: "one", label: "Act 1", intro: "", armour_class: "", slots: [{ slot: "Chest", items: ["Guide Mail"], alternates: ["Wiki Vest"] }] },
      { act: "three", label: "Act 3", intro: "", armour_class: "", slots: [{ slot: "Head", items: ["Late Helm"], alternates: [] }] },
    ],
  };
  const actOne = renderGearTab(profile, data, emptyProgress(), false, null);
  assert.match(actOne, /data-loadout-act="one" aria-pressed="true"/);
  const table = actOne.slice(actOne.indexOf("loadout-table"));
  assert.match(table, /data-item="Guide Mail"[^]*data-label="Alternates"[^]*data-item="Wiki Vest"/);
  assert.doesNotMatch(table, /Late Helm/);
  const actThree = renderGearTab(profile, data, emptyProgress(), false, "three");
  assert.match(actThree, /data-loadout-act="three" aria-pressed="true"/);
  assert.match(actThree.slice(actThree.indexOf("loadout-table")), /Late Helm/);
});
