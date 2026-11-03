// Unit tests for the party profile helpers. Run with: node --test tests/
import assert from "node:assert/strict";
import { test } from "node:test";

import { abilityFacts, abilityName } from "../assets/js/abilities.js";
import { wantedByItem } from "../assets/js/data.js";
import { partyPlans, renderAbilityDetail } from "../assets/js/detail.js";
import { entryTags } from "../assets/js/html.js";
import { planGroups, renderGearTab, renderLoadouts } from "../assets/js/gearplan.js";
import { levelLearning, renderPlaybookTab } from "../assets/js/guides.js";
import { choiceSummary, choiceValue } from "../assets/js/levelup.js";
import { parsePartyRoute } from "../assets/js/party.js";
import { abilityLink, renderLevelPicks, renderPicksPage, renderSpellPicks } from "../assets/js/picks.js";
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

test("entryTags shows a plan's priority or an options profile's tags", () => {
  assert.match(entryTags({ priority: "core" }), /tag-core">Core</);
  assert.equal(
    entryTags({ tags: ["dc", "radiant"] }),
    '<span class="tag tag-dc">Spell DC</span><span class="tag tag-radiant">Radiant</span>',
  );
  assert.equal(entryTags({}), "");
});

test("an options profile's act loadout is a bucket of picks with tags, not default and alternates", () => {
  const item = (id) => ({ id, label: id, rarity: "rare", earliest: null, acquisitions: [] });
  const data = { byId: new Map(["Hood", "Staff"].map((id) => [id, item(id)])), abilities };
  const profile = {
    style: "options",
    gear: [{ item: "Hood", tags: ["dc"] }, { item: "Staff", tags: ["dc"] }],
    loadouts: [{ act: "three", label: "Act 3", intro: "", slots: [{ slot: "Head", items: ["Hood", "Staff"] }] }],
  };
  const table = renderLoadouts(profile, data.byId, abilities, null);
  assert.match(table, /bucket-table/);
  assert.match(table, /Good picks/);
  assert.doesNotMatch(table, /Alternates/);
  assert.equal(table.match(/tag-dc/g)?.length, 2);
});

test("renderPlaybookTab shows only the sections a profile has, in order", () => {
  const html = renderPlaybookTab({ playbook: { mage_hand: ["Scout"], turn: ["Dash", "Strike"] } });
  assert.ok(html.indexOf("A turn in combat") < html.indexOf("Mage Hand jobs"));
  assert.match(html, /A turn in combat<\/h3><ol/);
  assert.doesNotMatch(html, /Reaction settings|Stealing safely/);
});

test("a full plan's gear tab puts the loadout summary before the checklist", () => {
  const item = (id) => ({ id, label: id, rarity: "rare", earliest: null, acquisitions: [] });
  const data = { byId: new Map([["Mail", item("Mail")]]), abilities };
  const profile = {
    gear: [{ item: "Mail", priority: "core" }],
    loadouts: [{ act: "one", label: "Act 1", intro: "", slots: [{ slot: "Chest", items: ["Mail"], alternates: [] }] }],
  };
  const html = renderGearTab(profile, data, emptyProgress(), false, null);
  assert.ok(html.indexOf("End-of-act loadout") < html.indexOf("Item checklist"));
});

test("abilityLink falls back to plain text for names the snapshot doesn't have", () => {
  assert.equal(abilityLink("Made Up", abilities), '<span class="plain-item">Made Up</span>');
});

test("renderAbilityDetail fills the side panel with the spell's facts and description", () => {
  const panel = { innerHTML: "", hidden: true, scrollTop: 5 };
  renderAbilityDetail(panel, {
    name: "Hold <Person>",
    kind: "spell",
    spell_level: 2,
    school: "Enchantment",
    description: "Hold a humanoid.",
    wiki_url: "https://bg3.wiki/wiki/Hold_Person",
  });
  assert.equal(panel.hidden, false);
  assert.equal(panel.scrollTop, 0);
  assert.match(panel.innerHTML, /Hold &lt;Person&gt;/);
  assert.match(panel.innerHTML, /Level 2 spell/);
  assert.match(panel.innerHTML, /<li>Enchantment<\/li>/);
  assert.match(panel.innerHTML, /href="https:\/\/bg3.wiki\/wiki\/Hold_Person"/);
});

test("renderSpellPicks shows each spell level once, spells as item-style links", () => {
  const html = renderSpellPicks(
    { spells: [{ label: "Level 1 spells", from: 2, abilities: ["Sleep", "Unknown Spell"] }] },
    abilities,
  );
  assert.match(html, /<h3>Good spells<\/h3>/);
  assert.match(html, /Level 1 spells<span class="row-sub">From character level 2<\/span>/);
  assert.match(html, /<button type="button" class="item-link ability-link" data-ability-detail="Sleep">/);
  assert.match(html, /<span class="plain-item">Unknown Spell<\/span>/);
  assert.equal(renderSpellPicks({}, abilities), "");
});

test("renderLevelPicks links feats and class choices to their wiki entry, with a short note", () => {
  const html = renderLevelPicks(
    {
      levels: [
        {
          level: 4,
          picks: [{ label: "Feat", entries: [{ ability: "Sleep", note: "go first" }, { text: "Ability Improvement" }] }],
        },
      ],
    },
    abilities,
  );
  assert.match(html, /Level 4<span class="row-sub">Feat<\/span>/);
  assert.match(html, /data-ability-detail="Sleep">[^]*?<\/button> <span class="pick-note">go first<\/span>/);
  assert.match(html, /<span class="pick-name">Ability Improvement<\/span><\/div>/);
});

test("a friend's page shows gear by act, spells, then picks by level, with no checklist", () => {
  const item = (id) => ({ id, label: id, rarity: "rare", earliest: null, acquisitions: [] });
  const data = { byId: new Map([["Hood", item("Hood")]]), abilities };
  const profile = {
    style: "options",
    spells: [{ label: "Cantrips", from: 1, abilities: ["Sleep"] }],
    levels: [{ level: 4, picks: [{ label: "Feat", entries: [{ text: "Alert" }] }] }],
    gear: [{ item: "Hood", tags: ["dc"] }],
    loadouts: [{ act: "one", label: "Act 1", intro: "", slots: [{ slot: "Head", items: ["Hood"] }] }],
  };
  const html = renderPicksPage(profile, data, null);
  const order = ["Good picks by act", "Good spells", "Good picks by level"].map((h) => html.indexOf(h));
  assert.ok(order.every((at) => at >= 0));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  assert.doesNotMatch(html, /Item checklist|data-progress/);
});
