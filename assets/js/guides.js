// A profile's reference tabs: illithid powers, and how the character plays.

import { esc } from "./html.js";
import { abilityLink } from "./picks.js";

/** Suggested illithid powers in order; each opens in the side panel like a spell. */
export function renderIllithidTab(profile, abilities, progress) {
  const { illithid } = profile;
  const taken = new Set(progress.taken);
  const rows = illithid.powers
    .map((power) => {
      const name = power.abilities[0];
      return `
        <li class="check-row power-row${taken.has(name) ? " is-done" : ""}">
          <input type="checkbox" data-progress="taken" value="${esc(name)}"${taken.has(name) ? " checked" : ""}
            aria-label="Taken ${esc(abilities.get(name)?.name ?? name)}" />
          <div>
            <p class="power-name">${power.abilities.map((n) => abilityLink(n, abilities)).join("")} <span class="muted small">${esc(power.when)}</span></p>
            <p class="small">${esc(power.why)}</p>
          </div>
        </li>`;
    })
    .join("");
  return `
    <p class="prose">${esc(illithid.intro)}</p>
    <ul class="callouts"><li>${esc(illithid.warning)}</li></ul>
    <ul class="check-list">${rows}</ul>`;
}

const list = (tag, items) => `<${tag} class="steps">${items.map((s) => `<li>${esc(s)}</li>`).join("")}</${tag}>`;

// Sections in display order; a profile shows only the ones it has.
const PLAYBOOK_SECTIONS = [
  ["turn", "A turn in combat"],
  ["start_of_day", "Start of each day"],
  ["theft", "Stealing safely"],
  ["reactions", "Reaction settings"],
  ["mage_hand", "Mage Hand jobs"],
];

function reactionTable(reactions) {
  const rows = reactions
    .map(
      (r) =>
        `<tr><th scope="row">${esc(r.name)}</th><td><span class="tag">${esc(r.setting)}</span></td><td>${esc(r.why)}</td></tr>`,
    )
    .join("");
  return `<div class="table-wrap"><table class="loadout-table">
      <thead><tr><th scope="col">Reaction</th><th scope="col">Setting</th><th scope="col">Why</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
}

export function renderPlaybookTab(profile) {
  const { playbook } = profile;
  // The combat turn and theft steps are sequences; the rest are lists of independent tips.
  const ordered = (key) => key === "turn" || key === "theft";
  return PLAYBOOK_SECTIONS.filter(([key]) => playbook[key]?.length)
    .map(([key, title]) => {
      const body = key === "reactions" ? reactionTable(playbook.reactions) : list(ordered(key) ? "ol" : "ul", playbook[key]);
      return `<section class="guide-block"><h3>${title}</h3>${body}</section>`;
    })
    .join("");
}
