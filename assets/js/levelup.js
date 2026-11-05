// The level-up card: exactly what to pick at one level, in the order the game asks, then what to prepare.
// Each spell or feature is a link that opens it in the side panel, like items and friends' picks.

import { esc } from "./html.js";
import { abilityLink } from "./picks.js";

export const MAX_LEVEL = 12;

const names = (list, abilities) =>
  `<span class="ability-links">${list.map((name) => abilityLink(name, abilities)).join("")}</span>`;

/** One choice's answer: plain text, ability names, or "old → new" for a spell replacement. */
export function choiceValue(choice, abilities) {
  const parts = [];
  if (choice.replace) {
    const [from, to] = choice.replace;
    parts.push(
      `<span class="replace">${abilityLink(from, abilities)} <span aria-hidden="true">→</span><span class="visually-hidden">becomes</span> ${abilityLink(to, abilities)}</span>`,
    );
  }
  if (choice.abilities) parts.push(names(choice.abilities, abilities));
  // Text beside spell names explains them, so it's set quieter than the names themselves.
  if (choice.text) parts.push(parts.length ? `<span class="muted">${esc(choice.text)}</span>` : esc(choice.text));
  return parts.join(" ");
}

/** Plain-text version of a level's choices for the at-a-glance list. */
export function choiceSummary(level, abilities) {
  if (!level.choices.length) return "No choices";
  const label = (name) => abilities.get(name)?.name ?? name;
  return level.choices
    .map((c) => {
      const value = c.replace
        ? `${label(c.replace[0])} → ${label(c.replace[1])}`
        : [...(c.abilities ?? []).map(label), ...(c.abilities ? [] : [c.text])].filter(Boolean).join(", ");
      return `${c.label}: ${value}`;
    })
    .join("; ");
}

const classLabel = (level) => `${level.class} ${level.class_level}`;

function status(levelNumber, reached) {
  if (levelNumber <= reached) return `<span class="level-status level-done">Done</span>`;
  if (levelNumber === reached + 1) return `<span class="level-status level-next">Next level-up</span>`;
  return `<span class="level-status">Later</span>`;
}

function afterLevel(level, previous, abilities) {
  const blocks = [];
  if (level.prepare) {
    blocks.push(`
      <div class="after-block">
        <h4>Prepare ${level.prepare.count} Wizard spells</h4>
        <ul class="pill-list">${level.prepare.abilities.map((n) => `<li>${abilityLink(n, abilities)}</li>`).join("")}</ul>
        ${level.prepare.note ? `<p class="muted small">${esc(level.prepare.note)}</p>` : ""}
      </div>`);
  }
  if (level.scribe_up_to && level.scribe_up_to !== previous?.scribe_up_to) {
    blocks.push(`
      <div class="after-block">
        <h4>Scribe level ${level.scribe_up_to} scrolls</h4>
        <p>You can now copy level ${level.scribe_up_to} Wizard scrolls into the spellbook.</p>
      </div>`);
  }
  return blocks.length ? `<h3>After you level up</h3>${blocks.join("")}` : "";
}

/** The card for `viewing`, plus the controls to move between levels and record progress. */
export function renderLevelTab(profile, abilities, reached, viewing) {
  const level = profile.levels.find((l) => l.level === viewing);
  const previous = profile.levels.find((l) => l.level === viewing - 1);
  const heading = viewing === 1 ? `Level 1: create ${profile.name} (${classLabel(level)})` : `Level ${viewing}: ${classLabel(level)}`;

  const choices = level.choices.length
    ? `<dl class="choices">${level.choices
        .map((c) => `<div><dt>${esc(c.label)}</dt><dd>${choiceValue(c, abilities)}</dd></div>`)
        .join("")}</dl>`
    : `<p class="no-choices">Nothing to pick at this level. Confirm the level-up.</p>`;

  const warnings = level.warnings?.length
    ? `<ul class="callouts">${level.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>`
    : "";


  const gained = level.abilities?.length ? `<div class="level-new"><span class="muted">New</span>${names(level.abilities, abilities)}</div>` : "";

  const isNext = viewing === reached + 1;
  const confirm = isNext
    ? `<button type="button" class="primary-button" data-level-reached="${viewing}">I'm level ${viewing} now</button>`
    : "";
  const finished = reached === MAX_LEVEL ? `<p class="muted">${esc(profile.name)} has reached level ${MAX_LEVEL}: the final build.</p>` : "";

  const levelOptions = Array.from({ length: MAX_LEVEL + 1 }, (_, n) => {
    const label = n === 0 ? "Not created yet" : `Level ${n}`;
    return `<option value="${n}"${n === reached ? " selected" : ""}>${label}</option>`;
  }).join("");

  const timeline = profile.levels
    .map(
      (l) => `
      <li class="${l.level === viewing ? "is-viewing" : ""}">
        <button type="button" class="timeline-level" data-level-view="${l.level}"${l.level === viewing ? ' aria-current="step"' : ""}>
          <span class="timeline-number">${l.level}</span>${esc(classLabel(l))}
        </button>
        <span class="timeline-summary">${esc(choiceSummary(l, abilities))}</span>
      </li>`,
    )
    .join("");

  return `
    <div class="level-stage">
    <button type="button" class="step-button" data-level-view="${viewing - 1}"${viewing <= 1 ? " disabled" : ""}>Level ${Math.max(1, viewing - 1)}</button>
    <section class="level-card" aria-labelledby="level-heading">
      <header class="level-head">
        <h3 id="level-heading" tabindex="-1">${esc(heading)}</h3>
        ${status(viewing, reached)}
      </header>
      ${choices}
      ${warnings}
      <h3>What changes</h3>
      <p>${esc(level.gains)}</p>
      ${level.play ? `<p class="muted">${esc(level.play)}</p>` : ""}
      ${gained}
      ${afterLevel(level, previous, abilities)}
      ${confirm ? `<div class="level-actions">${confirm}</div>` : ""}
    </section>
    <button type="button" class="step-button step-next" data-level-view="${viewing + 1}"${viewing >= MAX_LEVEL ? " disabled" : ""}>Level ${Math.min(MAX_LEVEL, viewing + 1)}</button>
    </div>
    ${finished}
    <label class="field level-reached">
      <span class="field-label">${esc(profile.name)}'s current level</span>
      <select data-level-select>${levelOptions}</select>
    </label>
    <details class="timeline">
      <summary>All levels at a glance</summary>
      <p class="muted small">${esc(profile.level_order)}.</p>
      <ol class="timeline-list">${timeline}</ol>
    </details>`;
}
