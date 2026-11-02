// Pop-outs that explain passives, weapon actions and spells, in the item panel and on party profiles.
//
// Hovering (mouse) or focusing (keyboard) a name previews it; clicking or tapping pins it open until you
// click elsewhere, press Escape, or click the name again. The pop-out is inserted right after its name so
// its wiki link is next in the tab order.

import { capitalize, esc, linkify, safeWikiUrl } from "./html.js";

const HOVER_OPEN_MS = 120;
const HOVER_CLOSE_MS = 200;
const EDGE_MARGIN_PX = 8;
const GAP_PX = 6;

/** An ability's name as a pop-out trigger, or plain text when the snapshot has no data for it. */
export function abilityName(name, abilities) {
  const ability = abilities.get(name);
  if (!ability) return esc(name);
  return `<button type="button" class="ability-trigger" data-ability="${esc(name)}" aria-expanded="false">${esc(ability.name)}</button>`;
}

/** A titled list of ability names; names with wiki data become pop-out triggers. */
export function abilityList(title, names, abilities) {
  const shown = (names ?? []).filter(Boolean);
  if (!shown.length) return "";
  const rows = shown.map((name) => `<li>${abilityName(name, abilities)}</li>`);
  return `<h3>${title}</h3><ul class="plain-list ability-list">${rows.join("")}</ul>`;
}

const ACTION_TYPES = { action: "Action", bonus: "Bonus action", reaction: "Reaction" };

function spellFacts(spell) {
  const facts = [spell.spell_level === 0 ? "Cantrip" : `Level ${spell.spell_level} spell`];
  if (spell.school) facts.push(spell.school);
  if (spell.action_type) facts.push(ACTION_TYPES[spell.action_type] ?? capitalize(spell.action_type));
  if (spell.concentration) facts.push("Concentration");
  if (spell.ritual) facts.push("Ritual");
  if (spell.recharge) facts.push(`Recharges on ${spell.recharge.toLowerCase()}`);
  return facts;
}

/** Short facts shown as tags: what kind of ability it is, what it costs, when it recharges. */
export function abilityFacts(ability) {
  if (ability.kind === "spell") return spellFacts(ability);
  const facts = [capitalize(ability.kind === "action" ? (ability.type ?? "action") : "passive")];
  if (ability.cost) facts.push(capitalize(ability.cost));
  if (ability.recharge) facts.push(`Recharges on ${ability.recharge.toLowerCase()}`);
  return facts;
}

export function popContent(ability) {
  const wiki = safeWikiUrl(ability.wiki_url);
  const icon = ability.icon_url
    ? `<img class="item-icon" src="${esc(ability.icon_url)}" alt="" width="32" height="32" decoding="async" />`
    : "";
  return `
    <div class="pop-head">${icon}<p class="pop-name">${esc(ability.name)}</p></div>
    <ul class="pop-facts">${abilityFacts(ability)
      .map((fact) => `<li>${esc(fact)}</li>`)
      .join("")}</ul>
    <p class="prose">${linkify(ability.description ?? "bg3.wiki has no description for this.", ability.links)}</p>
    ${ability.extra_description ? `<p class="prose muted small">${esc(ability.extra_description)}</p>` : ""}
    ${wiki ? `<a class="pop-wiki" href="${esc(wiki)}" target="_blank" rel="noopener">Open on bg3.wiki</a>` : ""}`;
}

/** Wire pop-outs for every trigger inside `root`. Returns `hide` for callers that re-render `root`. */
export function initAbilityPopovers(root, abilities) {
  const pop = document.createElement("div");
  pop.id = "ability-pop";
  pop.className = "ability-pop";
  pop.setAttribute("role", "dialog");
  pop.hidden = true;

  let trigger = null;
  let pinned = false;
  let timer = null;

  const later = (fn, ms) => {
    clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };

  function place() {
    const anchor = trigger.getBoundingClientRect();
    const box = pop.getBoundingClientRect();
    let top = anchor.bottom + GAP_PX;
    if (top + box.height > innerHeight - EDGE_MARGIN_PX && anchor.top - GAP_PX - box.height > EDGE_MARGIN_PX) {
      top = anchor.top - GAP_PX - box.height;
    }
    const left = Math.min(Math.max(EDGE_MARGIN_PX, anchor.left), innerWidth - box.width - EDGE_MARGIN_PX);
    pop.style.top = `${Math.round(top)}px`;
    pop.style.left = `${Math.round(Math.max(EDGE_MARGIN_PX, left))}px`;
  }

  function show(next, pin) {
    clearTimeout(timer);
    if (trigger && trigger !== next) trigger.setAttribute("aria-expanded", "false");
    const ability = abilities.get(next.dataset.ability);
    trigger = next;
    pinned = pin;
    pop.innerHTML = popContent(ability);
    pop.setAttribute("aria-label", ability.name);
    next.after(pop);
    next.setAttribute("aria-controls", pop.id);
    next.setAttribute("aria-expanded", "true");
    pop.hidden = false;
    place();
  }

  function hide() {
    clearTimeout(timer);
    if (!trigger) return;
    trigger.setAttribute("aria-expanded", "false");
    pop.hidden = true;
    trigger = null;
    pinned = false;
  }

  const isInside = (node) => Boolean(node?.closest?.(".ability-pop") || (trigger && node?.closest?.(".ability-trigger") === trigger));

  root.addEventListener("pointerover", (event) => {
    if (event.pointerType !== "mouse") return;
    const target = event.target.closest(".ability-trigger");
    if (target && !(target === trigger && pinned)) later(() => show(target, false), HOVER_OPEN_MS);
    else if (isInside(event.target)) clearTimeout(timer);
  });

  root.addEventListener("pointerout", (event) => {
    if (event.pointerType !== "mouse" || pinned || isInside(event.relatedTarget)) return;
    if (event.target.closest(".ability-trigger, .ability-pop")) later(hide, HOVER_CLOSE_MS);
  });

  root.addEventListener("click", (event) => {
    const target = event.target.closest(".ability-trigger");
    if (!target) return;
    if (target === trigger && pinned) hide();
    else show(target, true);
  });

  root.addEventListener("focusin", (event) => {
    const target = event.target.closest(".ability-trigger");
    if (target && target !== trigger) show(target, false);
  });

  root.addEventListener("focusout", (event) => {
    if (!pinned && !isInside(event.relatedTarget)) hide();
  });

  document.addEventListener("click", (event) => {
    if (trigger && !isInside(event.target)) hide();
  });

  // Escape closes the pop-out first; the item panel only closes on a second press.
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape" || !trigger) return;
      const opener = trigger;
      hide();
      opener.focus();
      event.stopImmediatePropagation();
    },
    true,
  );

  document.addEventListener("scroll", () => trigger && place(), true);
  window.addEventListener("resize", () => trigger && place());

  return { hide };
}
