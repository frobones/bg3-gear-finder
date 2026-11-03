// An item's "Special" text from bg3.wiki, split into plain facts and the actions or spells the item grants.
//
// The wiki flattens each grant into lines: a header such as "Plant Growth (Action)", then optional
// "Cast as a level 3 spell", a description that may wrap across lines, and "( Recharge: Short rest.)".

import { abilityName, rechargeFact } from "./abilities.js";
import { esc } from "./html.js";

const GRANT_HEADER = /^(.+?) \(([^()]*\b(?:Action|Reaction)\b[^()]*)\)$/;
const RECHARGE = /\(\s*Recharge:\s*([^.)]+)\.?\s*\)/;
const CAST_AS = /^Cast as (?:an? )?(.+?)\.?$/;
// The wiki's flattening drops the space in "6d6Piercing".
const GLUED_DICE = /(\d+d\d+)([A-Z])/g;

function sentenceCase(text) {
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

function tidy(text) {
  return text
    .replace(GLUED_DICE, "$1 $2")
    .replace(RECHARGE, (_, when) => `(recharges on ${when.trim().toLowerCase()})`);
}

/** A bare name line followed by a line with a recharge is a grant whose header lost its cost. */
function bareHeader(line, next) {
  return !line.endsWith(".") && !line.endsWith(":") && RECHARGE.test(next ?? "");
}

/**
 * Split Special text into `facts` (bullet points and loose lines) and `grants`
 * ({name, costs, cast, recharge, when, text}). A line ending in ":" just before a grant is that grant's condition.
 */
export function parseSpecial(text) {
  const facts = [];
  const grants = [];
  let current = null;
  let pendingWhen = null;
  const lines = (text ?? "")
    .split("\n")
    .map((raw) => raw.trim())
    .filter(Boolean);
  lines.forEach((line, index) => {
    if (line.startsWith("•")) {
      facts.push(tidy(line.replace(/^•\s*/, "")));
      current = null;
      return;
    }
    const header = line.match(GRANT_HEADER) ?? (!current && bareHeader(line, lines[index + 1]) ? [line, line, ""] : null);
    if (header) {
      const costs = header[2] ? header[2].split(" + ").map(sentenceCase) : [];
      current = { name: header[1], costs, cast: null, recharge: null, when: pendingWhen, lines: [] };
      pendingWhen = null;
      grants.push(current);
      return;
    }
    if (!current) {
      if (line.endsWith(":")) pendingWhen = line.slice(0, -1);
      else facts.push(tidy(line));
      return;
    }
    let rest = line;
    const recharge = rest.match(RECHARGE);
    if (recharge) {
      current.recharge = recharge[1].trim();
      rest = rest.replace(RECHARGE, "").trim();
    }
    const cast = rest.match(CAST_AS);
    if (cast) {
      current.cast = sentenceCase(cast[1]);
      rest = "";
    }
    if (rest) current.lines.push(rest.replace(GLUED_DICE, "$1 $2"));
  });
  if (pendingWhen) facts.push(pendingWhen);
  return {
    facts,
    grants: grants.map(({ lines, ...grant }) => ({ ...grant, text: lines.join(" ") })),
  };
}

function grantItem(grant, abilities) {
  const tags = [...grant.costs, grant.cast, grant.recharge ? rechargeFact(grant.recharge) : null].filter(
    Boolean,
  );
  return `
    <li>
      <p class="grant-name">${abilityName(grant.name, abilities)}</p>
      <ul class="pop-facts">${tags.map((tag) => `<li>${esc(tag)}</li>`).join("")}</ul>
      ${grant.when ? `<p class="grant-when">${esc(grant.when)}</p>` : ""}
      ${grant.text ? `<p class="prose">${esc(grant.text)}</p>` : ""}
    </li>`;
}

/** The Special card in the item panel: facts as a list, then each granted action with its cost and recharge. */
export function renderSpecial(text, abilities) {
  const { facts, grants } = parseSpecial(text);
  if (!facts.length && !grants.length) return "";
  const factList = facts.length ? `<ul class="plain-list special-facts">${facts.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>` : "";
  const grantList = grants.length ? `<ul class="special-grants">${grants.map((g) => grantItem(g, abilities)).join("")}</ul>` : "";
  return `<section class="effect-card" aria-label="Special"><h3>Special</h3>${factList}${grantList}</section>`;
}
