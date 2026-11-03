// A friend's profile: good picks by level and by act, then the item checklist. It shows options, not a plan.

import { abilityName } from "./abilities.js";
import { renderGearChecklist, renderLoadouts } from "./gearplan.js";
import { esc } from "./html.js";

function pickGroup(group, abilities) {
  const spells = group.abilities?.length
    ? `<ul class="pill-list">${group.abilities.map((n) => `<li>${abilityName(n, abilities)}</li>`).join("")}</ul>`
    : "";
  // Written options are short sentences, so they stack rather than sit in a row.
  const written = group.options?.length
    ? `<ul class="option-list">${group.options.map((o) => `<li>${esc(o)}</li>`).join("")}</ul>`
    : "";
  return `<div class="pick-group"><h4>${esc(group.label)}</h4>${spells}${written}</div>`;
}

/** One row per level: what the level gives, then the good picks it offers. */
export function renderLevelPicks(profile, abilities) {
  const rows = profile.levels
    .map((level) => {
      const gained = level.abilities?.length
        ? `<p class="small">New: ${level.abilities.map((n) => abilityName(n, abilities)).join(", ")}</p>`
        : "";
      const picks = (level.picks ?? []).map((g) => pickGroup(g, abilities)).join("");
      return `
        <tr>
          <th scope="row"><span class="timeline-number">${level.level}</span></th>
          <td>
            <p class="level-gains">${esc(level.gains)}</p>
            ${gained}
            ${picks}
          </td>
        </tr>`;
    })
    .join("");
  return `
    <h3>Good picks by level</h3>
    <div class="table-wrap">
      <table class="loadout-table level-picks">
        <caption class="visually-hidden">Good picks at each level</caption>
        <thead><tr><th scope="col">Level</th><th scope="col">What you get, and good picks</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

export function renderPicksPage(profile, data, progress, hideGot, loadoutAct) {
  return `
    ${renderLevelPicks(profile, data.abilities)}
    ${renderLoadouts(profile, data.byId, data.abilities, loadoutAct)}
    ${renderGearChecklist(profile, data, progress, hideGot)}`;
}
