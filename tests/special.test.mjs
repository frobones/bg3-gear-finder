// Unit tests for reading an item's Special text. Run with: node --test tests/
import assert from "node:assert/strict";
import { test } from "node:test";

import { parseSpecial, renderSpecial } from "../assets/js/special.js";

test("parseSpecial splits bullet facts from a granted spell with its cast level and recharge", () => {
  const text =
    "• Advantage on Constitution Saving Throws.\nPlant Growth (Action)\nCast as a level 3 spell ( Recharge: Short rest.)";
  assert.deepEqual(parseSpecial(text), {
    facts: ["Advantage on Constitution Saving Throws."],
    grants: [
      { name: "Plant Growth", costs: ["Action"], cast: "Level 3 spell", recharge: "Short rest", when: null, text: "" },
    ],
  });
});

test("parseSpecial joins a wrapped description and keeps the condition line before a grant", () => {
  const text =
    "At 3 stacks of Scarlet Remittance:\nScarlet Feast (Bonus Action)\nIf you have a +3 bonus from\n" +
    "Scarlet Remittance, consume it to empower yourself in combat. ( Recharge: Long rest.)";
  const { facts, grants } = parseSpecial(text);
  assert.deepEqual(facts, []);
  assert.equal(grants[0].when, "At 3 stacks of Scarlet Remittance");
  assert.equal(grants[0].text, "If you have a +3 bonus from Scarlet Remittance, consume it to empower yourself in combat.");
  assert.equal(grants[0].recharge, "Long rest");
});

test("parseSpecial splits combined costs and keeps loose lines as facts", () => {
  const { facts, grants } = parseSpecial("Strength Saving Throws +1\nSearing Smite (Action + Bonus Action + Level 1 Spell Slot)");
  assert.deepEqual(facts, ["Strength Saving Throws +1"]);
  assert.deepEqual(grants[0].costs, ["Action", "Bonus action", "Level 1 spell slot"]);
  assert.equal(grants[0].recharge, null);
});

test("parseSpecial handles empty text", () => {
  assert.deepEqual(parseSpecial(null), { facts: [], grants: [] });
  assert.equal(renderSpecial("", new Map()), "");
});

test("renderSpecial lists facts, then each grant with tags and a pop-out when the ability is known", () => {
  const abilities = new Map([["Plant Growth", { name: "Plant Growth" }]]);
  const html = renderSpecial("• Fire resistance.\nPlant Growth (Action)\nCast as a level 3 spell ( Recharge: Short rest.)", abilities);
  assert.match(html, /^<section class="effect-card" aria-label="Special"><h3>Special<\/h3>/);
  assert.match(html, /<\/section>$/);
  assert.match(html, /<ul class="plain-list special-facts"><li>Fire resistance\.<\/li><\/ul>/);
  assert.match(html, /data-ability="Plant Growth"/);
  assert.match(html, /<li>Level 3 spell<\/li>/);
  assert.match(html, /<li>Recharges on short rest<\/li>/);
  assert.doesNotMatch(html, /Cast as/);
});

test("parseSpecial reads a grant whose header lost its cost, and spaces glued dice", () => {
  const { facts, grants } = parseSpecial(
    "Martial Exertion\nPush past your limits, taking 6d6Piercing damage. ( Recharge: Short rest.)",
  );
  assert.deepEqual(facts, []);
  assert.equal(grants[0].name, "Martial Exertion");
  assert.deepEqual(grants[0].costs, []);
  assert.equal(grants[0].text, "Push past your limits, taking 6d6 Piercing damage.");
  assert.equal(grants[0].recharge, "Short rest");
});

test("parseSpecial rewrites a recharge inside a fact", () => {
  const { facts } = parseSpecial("• Scarlet Regeneration: recover 3d10 Hit Points ( Recharge: Long rest).");
  assert.deepEqual(facts, ["Scarlet Regeneration: recover 3d10 Hit Points (recharges on long rest)."]);
});
