// A profile's reference tabs: scroll scribing, illithid powers, and how the character plays.

import { abilityName } from "./abilities.js";
import { esc } from "./html.js";
import { abilityLink } from "./picks.js";

const names = (list, abilities) => list.map((name) => abilityName(name, abilities)).join(", ");

/** The level whose choices learn `name` for free, used to say when a held-back scroll gets picked. */
export function levelLearning(profile, name) {
  return profile.levels.find((l) => l.choices.some((c) => c.abilities?.includes(name)))?.level ?? null;
}

function checkRow(list, name, checked, label, abilities, extra = "") {
  return `
    <li class="check-row${checked ? " is-done" : ""}">
      <input type="checkbox" data-progress="${list}" value="${esc(name)}"${checked ? " checked" : ""}
        aria-label="${esc(label)} ${esc(abilities.get(name)?.name ?? name)}" />
      <span>${abilityName(name, abilities)}${extra}</span>
    </li>`;
}

export function renderScrollsTab(profile, abilities, progress) {
  const { scrolls } = profile;
  const scribed = new Set(progress.scribed);
  const all = scrolls.tiers.flatMap((t) => t.scribe);
  const done = all.filter((n) => scribed.has(n)).length;

  const tiers = scrolls.tiers
    .map((tier) => {
      const open = progress.level >= tier.from_level;
      const holds = tier.hold
        .map((name) => {
          const at = levelLearning(profile, name);
          return `<li class="check-row hold-row"><span>${abilityName(name, abilities)}
            <span class="muted small">Don't scribe. Learn it free at level ${at}.</span></span></li>`;
        })
        .join("");
      return `
        <section class="scroll-tier${open ? "" : " is-locked"}">
          <header class="tier-head">
            <h3>Level ${tier.spell_level} spells</h3>
            <span class="level-status${open ? " level-done" : ""}">${open ? "Unlocked" : `From level ${tier.from_level}`}</span>
          </header>
          <p class="muted small">${esc(tier.note)}</p>
          <ul class="check-list">${tier.scribe.map((n) => checkRow("scribed", n, scribed.has(n), "Scribed", abilities)).join("")}${holds}</ul>
        </section>`;
    })
    .join("");

  const noScroll = scrolls.no_scroll
    .map((group) => `<li><span class="timeline-number">${group.level}</span><span>${names(group.abilities, abilities)}</span></li>`)
    .join("");

  return `
    <p class="prose">${esc(scrolls.intro)}</p>
    <p class="plan-count" tabindex="-1" aria-live="polite">${done} of ${all.length} scribed</p>
    ${tiers}
    <section class="scroll-tier">
      <h3>No scroll exists: take these at level-up</h3>
      <ul class="no-scroll-list">${noScroll}</ul>
      <p class="muted small">${names(scrolls.cannot_learn.abilities, abilities)}: ${esc(scrolls.cannot_learn.note)}</p>
    </section>`;
}

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
