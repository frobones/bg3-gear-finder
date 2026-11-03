// Item detail panel: stats, effects, and every way to get the item.

import { abilityEntries, abilityFacts, abilityList } from "./abilities.js";
import {
  ACT_LABELS,
  capitalize,
  entryTags,
  esc,
  formatNumber,
  itemIcon,
  linkify,
  rarityClass,
  safeWikiUrl,
} from "./html.js";
import { renderSpecial } from "./special.js";

const WEAPON_PROPERTIES = ["finesse", "light", "heavy", "reach", "thrown", "dippable"];
// What the panel calls each kind of item under its name: "Rare weapon", "Rare miscellaneous item".
const KIND_LABELS = { weapon: "weapon", equipment: "equipment", misc: "miscellaneous item" };

function stats(item) {
  const rows = [
    [item.kind === "misc" ? "Type" : "Slot", [item.type, item.kind === "weapon" && item.handedness ? `${item.handedness}` : null]],
    ["Proficiency", item.proficiency ?? (item.category ? capitalize(`${item.category} weapons`) : null)],
    ["Armour class", item.armour_class != null ? `${item.armour_class}` : null],
    ["AC bonus", item.armour_class_bonus],
    ["Damage", item.damage ? `${item.damage} ${item.damage_type ?? ""}` : null],
    ["Two-handed", item.versatile_damage],
    ["Extra damage", item.extra_damage ? `${item.extra_damage} ${item.extra_damage_type ?? ""}` : null],
    ["Extra damage", item.extra_damage_2 ? `${item.extra_damage_2} ${item.extra_damage_2_type ?? ""}` : null],
    ["Range", item.range_m != null ? `${item.range_m} m` : null],
    ["Properties", WEAPON_PROPERTIES.filter((p) => item[p] === true).map(capitalize).join(", ") || null],
    ["Stealth", item.stealth_disadvantage ? "Disadvantage" : null],
    ["Enchantment", item.enchantment != null ? `+${item.enchantment}` : null],
    ["Value", item.price != null ? `${formatNumber(item.price)} gold` : null],
    ["Weight", item.weight_kg != null ? `${item.weight_kg} kg` : null],
  ];
  return rows
    .map(([label, value]) => [label, Array.isArray(value) ? value.filter(Boolean).join(", ") : value])
    .filter(([, value]) => value != null && value !== "")
    .map(([label, value]) => `<div><dt>${label}</dt><dd>${esc(value)}</dd></div>`)
    .join("");
}

function textBlock(title, text) {
  return text ? `<h3>${title}</h3><p class="prose">${esc(text)}</p>` : "";
}

/** A place a party profile wrote down for this item, used when the wiki records none. */
function profilePlace(wanted) {
  const found = wanted.find(({ entry }) => entry.where);
  if (!found) return null;
  const { profile, entry } = found;
  return `
    <ol class="ways"><li>
      <p class="way-where">${esc(entry.act ? ACT_LABELS[entry.act] : "Anywhere")}</p>
      <p class="way-how">${esc(entry.where)}</p>
    </li></ol>
    <p class="muted small">From ${esc(profile.name)}'s plan: bg3.wiki doesn't record a place for this item.</p>`;
}

function whereToGet(item, wanted) {
  if (!item.acquisitions.length) {
    if (item.where_to_find) return `<p class="prose">${linkify(item.where_to_find, item.where_to_find_links)}</p>`;
    return profilePlace(wanted) ?? `<p class="prose muted">bg3.wiki doesn't record where to find this item.</p>`;
  }
  return `<ol class="ways">${item.acquisitions
    .map((a) => {
      const where = a.act ? [ACT_LABELS[a.act], ...(a.path ?? [])].join(" › ") : "Anywhere";
      return `<li><p class="way-where">${esc(where)}</p><p class="way-how">${linkify(a.description ?? "No details recorded.", a.links)}</p></li>`;
    })
    .join("")}</ol>`;
}

/**
 * Where an item sits in a profile's act loadouts, for example "Act 2, gloves (first pick)".
 * Vesper's plan names one pick per slot plus alternates; friends' slots are a bucket whose first item leads.
 */
export function loadoutUses(profile, name) {
  return (profile.loadouts ?? []).flatMap((loadout) =>
    loadout.slots.flatMap((slot) => {
      const items = slot.items ?? [];
      let role = null;
      if ((slot.alternates ?? []).includes(name)) role = "alternate";
      else if (items.includes(name)) {
        if (slot.alternates || items.length === 1) role = "pick";
        else role = items[0] === name ? "first pick" : "option";
      }
      return role ? [`${loadout.label}, ${slot.slot.toLowerCase()} (${role})`] : [];
    }),
  );
}

/**
 * Which party members plan around this item and what it does for their build.
 * A hand-off ("yield") row folds into a closing line when someone else's plan already explains the item.
 */
export function partyPlans(wanted) {
  if (!wanted.length) return "";
  const keeps = wanted.filter(({ entry }) => entry.priority !== "yield");
  const folded = keeps.length ? wanted.filter(({ entry }) => entry.priority === "yield") : [];
  const rows = (keeps.length ? keeps : wanted).map(({ profile, entry }) => {
    const uses = loadoutUses(profile, entry.item);
    return `
      <li>
        <p class="plan-who"><a href="#party/${esc(profile.id)}/gear" data-close>${esc(profile.name)}</a> ${entryTags(entry)}</p>
        ${uses.length ? `<p class="plan-uses">${esc(uses.join("; "))}</p>` : ""}
        ${entry.note ? `<p class="plan-note">${esc(entry.note)}</p>` : ""}
        ${entry.claim ? `<p class="plan-claim">Who gets it: ${esc(entry.claim)}</p>` : ""}
      </li>`;
  });
  const handOffs = folded
    .map(({ profile, entry }) => `<p class="plan-handoff">${esc(profile.name)} passes this on: ${esc(entry.claim ?? "")}</p>`)
    .join("");
  return `
    <section class="party-plans" aria-label="Party plans">
      <h3>Party plans</h3>
      <ul class="ways wanted">${rows.join("")}</ul>
      ${handOffs}
    </section>`;
}

export function renderDetail(panel, item, abilities, wanted) {
  const wiki = safeWikiUrl(item.wiki_url);
  const variants = item.variants?.length
    ? `<p class="muted small">The game has ${item.variants.length + 1} versions of this item; stats shown are the first.</p>`
    : "";
  panel.innerHTML = `
    <div class="detail-inner">
      <button type="button" class="close-button" data-close aria-label="Close item details">Close</button>
      <header class="detail-head">
        ${itemIcon(item, 64, false)}
        <div>
          <h2 class="detail-name ${rarityClass(item.rarity)}">${esc(item.label)}</h2>
          <p class="detail-kind">${esc(capitalize(item.rarity))} ${KIND_LABELS[item.kind]}</p>
        </div>
      </header>
      ${partyPlans(wanted)}
      <dl class="stats">${stats(item)}</dl>
      <h3>Where to get it</h3>
      ${whereToGet(item, wanted)}
      ${item.notes ? `<h3>Notes</h3><p class="prose">${linkify(item.notes, item.notes_links)}</p>` : ""}
      ${abilityEntries("Passives", item.passives, abilities)}
      ${abilityEntries("Weapon passives", item.weapon_passives, abilities)}
      ${abilityEntries("Main-hand passives", item.passives_main_hand, abilities)}
      ${abilityEntries("Off-hand passives", item.passives_off_hand, abilities)}
      ${abilityList("Weapon actions", [...(item.weapon_actions ?? []), ...(item.special_weapon_actions ?? [])], abilities)}
      ${renderSpecial(item.special, abilities)}
      ${textBlock("Effect", item.effect)}
      ${textBlock("About", item.description)}
      ${item.quote ? `<blockquote class="quote">${esc(item.quote)}</blockquote>` : ""}
      ${item.bugs ? `<details class="bugs"><summary>Known bugs</summary><p class="prose">${esc(item.bugs)}</p></details>` : ""}
      ${variants}
      ${wiki ? `<p><a class="wiki-link" href="${esc(wiki)}" target="_blank" rel="noopener">Open on bg3.wiki</a></p>` : ""}
    </div>`;
  panel.hidden = false;
  panel.scrollTop = 0;
}

/** A spell, feat or feature in the same side panel as items, for the picks on friends' pages. */
export function renderAbilityDetail(panel, ability) {
  const wiki = safeWikiUrl(ability.wiki_url);
  const icon = ability.icon_url
    ? `<img class="item-icon" src="${esc(ability.icon_url)}" alt="" width="64" height="64" decoding="async" />`
    : `<span class="item-icon item-icon-empty" style="--size:64px"></span>`;
  panel.innerHTML = `
    <div class="detail-inner">
      <button type="button" class="close-button" data-close aria-label="Close details">Close</button>
      <header class="detail-head">
        ${icon}
        <div>
          <h2 class="detail-name spell-name">${esc(ability.name)}</h2>
          <p class="detail-kind">${esc(abilityFacts(ability)[0])}</p>
        </div>
      </header>
      <ul class="pop-facts">${abilityFacts(ability)
        .slice(1)
        .map((fact) => `<li>${esc(fact)}</li>`)
        .join("")}</ul>
      <p class="prose">${linkify(ability.description ?? "bg3.wiki has no description for this.", ability.links)}</p>
      ${ability.extra_description ? `<p class="prose muted">${esc(ability.extra_description)}</p>` : ""}
      ${wiki ? `<p><a class="wiki-link" href="${esc(wiki)}" target="_blank" rel="noopener">Open on bg3.wiki</a></p>` : ""}
    </div>`;
  panel.hidden = false;
  panel.scrollTop = 0;
}
