// A friend's profile: good gear by act, good spells by spell level, feats and class choices by level, then the
// item checklist. Suggestions, not a plan.

import { renderGearChecklist, renderLoadouts } from "./gearplan.js";
import { esc } from "./html.js";

/** A spell, feat or feature as an item-style link that opens the side panel; plain text without wiki data. */
export function abilityLink(name, abilities) {
  const ability = abilities.get(name);
  if (!ability) return `<span class="plain-item">${esc(name)}</span>`;
  const icon = ability.icon_url
    ? `<img class="item-icon" src="${esc(ability.icon_url)}" alt="" width="24" height="24" loading="lazy" decoding="async" />`
    : `<span class="item-icon item-icon-empty" style="--size:24px"></span>`;
  return `<button type="button" class="item-link ability-link" data-ability-detail="${esc(name)}">${icon}<span class="item-name">${esc(ability.name)}</span></button>`;
}

/** A feat or class choice: a link to its wiki entry (or plain text if there is none) and a quiet note. */
function entryPick(entry, abilities) {
  const name = entry.ability ? abilityLink(entry.ability, abilities) : `<span class="pick-name">${esc(entry.text)}</span>`;
  return entry.note ? `${name} <span class="pick-note">${esc(entry.note)}</span>` : name;
}

/** One bucket-table row: a heading with a quieter sub-line, then the picks stacked like items. */
function pickRow(heading, sub, picks) {
  return `
    <tr>
      <th scope="row">${esc(heading)}<span class="row-sub">${esc(sub)}</span></th>
      <td>${picks.map((pick) => `<div class="loadout-item">${pick}</div>`).join("")}</td>
    </tr>`;
}

function bucketTable(caption, firstColumn, rows) {
  return `
    <div class="table-wrap">
      <table class="loadout-table bucket-table level-picks">
        <caption class="visually-hidden">${esc(caption)}</caption>
        <thead><tr><th scope="col">${esc(firstColumn)}</th><th scope="col">Good picks</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

/** Good spells grouped by spell level, so a spell appears once however many levels can learn it. */
export function renderSpellPicks(profile, abilities) {
  if (!profile.spells?.length) return "";
  const rows = profile.spells
    .map((group) =>
      pickRow(group.label, `From character level ${group.from}`, group.abilities.map((n) => abilityLink(n, abilities))),
    )
    .join("");
  return `<h3>Good spells</h3>${bucketTable("Good spells by spell level", "Spell level", rows)}`;
}

/** Feats and class choices by the character level that offers them. */
export function renderLevelPicks(profile, abilities) {
  if (!profile.levels?.length) return "";
  const rows = profile.levels
    .flatMap((level) =>
      level.picks.map((group) =>
        pickRow(`Level ${level.level}`, group.label, group.entries.map((e) => entryPick(e, abilities))),
      ),
    )
    .join("");
  return `<h3>Good picks by level</h3>${bucketTable("Good feats and class choices by level", "Level", rows)}`;
}

export function renderPicksPage(profile, data, progress, { hideGot, loadoutAct }) {
  return `
    ${renderLoadouts(profile, data.byId, data.abilities, loadoutAct)}
    ${renderSpellPicks(profile, data.abilities)}
    ${renderLevelPicks(profile, data.abilities)}
    ${renderGearChecklist(profile, data, progress, hideGot)}`;
}
