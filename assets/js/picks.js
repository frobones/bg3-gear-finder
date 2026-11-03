// A friend's profile: good picks by act and by level, then the item checklist. Suggestions, not a plan.

import { renderGearChecklist, renderLoadouts } from "./gearplan.js";
import { esc } from "./html.js";

export const LEVEL_TIERS = [
  { id: "1-4", label: "Levels 1–4", from: 1, to: 4 },
  { id: "5-8", label: "Levels 5–8", from: 5, to: 8 },
  { id: "9-12", label: "Levels 9–12", from: 9, to: 12 },
];

/** A spell as an item-style link that opens the side panel; plain text if the snapshot has no data for it. */
export function spellLink(name, abilities) {
  const ability = abilities.get(name);
  if (!ability) return `<span class="plain-item">${esc(name)}</span>`;
  const icon = ability.icon_url
    ? `<img class="item-icon" src="${esc(ability.icon_url)}" alt="" width="24" height="24" loading="lazy" decoding="async" />`
    : `<span class="item-icon item-icon-empty" style="--size:24px"></span>`;
  return `<button type="button" class="item-link spell-link" data-spell="${esc(name)}">${icon}<span class="item-name">${esc(ability.name)}</span></button>`;
}

/** "Alert: go first" becomes a bold name with a quiet note, matching how items read. */
function writtenPick(option) {
  const at = option.indexOf(": ");
  if (at === -1) return `<span class="pick-name">${esc(option)}</span>`;
  return `<span class="pick-name">${esc(option.slice(0, at))}</span> <span class="pick-note">${esc(option.slice(at + 2))}</span>`;
}

/** Good picks for one range of levels: a row per level and kind of choice. */
export function renderLevelPicks(profile, abilities, tierId) {
  const tier = LEVEL_TIERS.find((t) => t.id === tierId) ?? LEVEL_TIERS[0];
  const buttons = LEVEL_TIERS.map(
    (t) => `<button type="button" class="segment" data-level-tier="${t.id}" aria-pressed="${t === tier}">${t.label}</button>`,
  ).join("");
  const rows = profile.levels
    .filter((level) => level.level >= tier.from && level.level <= tier.to)
    .flatMap((level) =>
      level.picks.map(
        (group) => `
        <tr>
          <th scope="row">Level ${level.level}<span class="row-sub">${esc(group.label)}</span></th>
          <td>${[
            ...(group.abilities ?? []).map((n) => spellLink(n, abilities)),
            ...(group.options ?? []).map(writtenPick),
          ]
            .map((pick) => `<div class="loadout-item">${pick}</div>`)
            .join("")}</td>
        </tr>`,
      ),
    )
    .join("");
  return `
    <h3 id="level-picks-heading">Good picks by level</h3>
    <div class="segments" role="group" aria-labelledby="level-picks-heading">${buttons}</div>
    <div class="table-wrap">
      <table class="loadout-table bucket-table level-picks">
        <caption class="visually-hidden">Good picks for ${esc(tier.label)}</caption>
        <thead><tr><th scope="col">Level</th><th scope="col">Good picks</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

export function renderPicksPage(profile, data, progress, { hideGot, loadoutAct, levelTier }) {
  return `
    ${renderLoadouts(profile, data.byId, data.abilities, loadoutAct)}
    ${renderLevelPicks(profile, data.abilities, levelTier)}
    ${renderGearChecklist(profile, data, progress, hideGot)}`;
}
