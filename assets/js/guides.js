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

// Sections in display order, with the jump bar's short label; a profile shows only the ones it has.
const PLAYBOOK_SECTIONS = [
  ["turn", "A turn in combat", "Combat"],
  ["start_of_day", "Start of each day", "Start of day"],
  ["theft", "Stealing safely", "Theft"],
  ["reactions", "Reaction settings", "Reactions"],
  ["mage_hand", "Mage Hand jobs", "Mage Hand"],
];

const levelTag = (entry) => (entry.from_level ? `<span class="tag">Level ${entry.from_level}+</span>` : "");

/** Titled tips as a grid of small cards. */
function cards(entries) {
  return `<ul class="pb-cards">${entries
    .map(
      (e) => `
      <li class="pb-card">
        <p class="pb-card-title">${esc(e.title)}${levelTag(e)}</p>
        <p>${esc(e.text)}</p>
      </li>`,
    )
    .join("")}</ul>`;
}

/** The combat loop as numbered steps side by side, then what to do when the plan changes. */
function combatTurn(turn) {
  const loop = turn.loop
    .map(
      (step, i) => `
      <li class="pb-step">
        <span class="pb-step-number" aria-hidden="true">${i + 1}</span>
        <p class="pb-card-title">${esc(step.title)}</p>
        <p>${esc(step.text)}</p>
      </li>`,
    )
    .join("");
  return `<ol class="pb-loop">${loop}</ol><h4 class="pb-subhead">When things change</h4>${cards(turn.situations)}`;
}

/** Theft in phases side by side, with the steps numbered straight through. */
function theftPhases(phases) {
  let next = 1;
  const columns = phases.map((phase) => {
    const start = next;
    next += phase.steps.length;
    return `
      <div class="pb-phase">
        <h4 class="pb-subhead">${esc(phase.title)}</h4>
        <ol class="steps" start="${start}">${phase.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
      </div>`;
  });
  return `<div class="pb-phases">${columns.join("")}</div>`;
}

/** Reaction settings, Always first, each with a coloured setting pill. */
function reactionRows(reactions) {
  const always = reactions.filter((r) => r.setting === "Always");
  const rest = reactions.filter((r) => r.setting !== "Always");
  return `<ul class="pb-reactions">${[...always, ...rest]
    .map(
      (r) => `
      <li>
        <span class="pb-setting pb-setting-${esc(r.setting.toLowerCase())}">${esc(r.setting)}</span>
        <p class="pb-card-title">${esc(r.name)}</p>
        <p class="pb-why">${esc(r.why)}</p>
      </li>`,
    )
    .join("")}</ul>`;
}

const checklist = (items) => `<ul class="pb-checklist">${items.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>`;

const SECTION_BODIES = {
  turn: combatTurn,
  start_of_day: checklist,
  theft: theftPhases,
  reactions: reactionRows,
  mage_hand: cards,
};

/** The Playbook tab: a jump bar, then each section the profile has in its own layout. */
export function renderPlaybookTab(profile) {
  const { playbook } = profile;
  const shown = PLAYBOOK_SECTIONS.filter(([key]) => playbook[key]);
  const jump = shown
    .map(([key, , label]) => `<button type="button" class="pb-jump-link" data-jump="pb-${key}">${label}</button>`)
    .join("");
  const sections = shown
    .map(
      ([key, title]) =>
        `<section class="guide-block pb-section" aria-labelledby="pb-${key}"><h3 id="pb-${key}" tabindex="-1">${title}</h3>${SECTION_BODIES[key](playbook[key])}</section>`,
    )
    .join("");
  return `<nav class="pb-jump" aria-label="Playbook sections">${jump}</nav>${sections}`;
}
