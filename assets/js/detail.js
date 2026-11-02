// Item detail panel: stats, effects, and every way to get the item.

import { abilityList } from "./abilities.js";
import {
  ACT_LABELS,
  capitalize,
  esc,
  formatNumber,
  itemIcon,
  linkify,
  priorityTag,
  rarityClass,
  safeWikiUrl,
} from "./html.js";

const WEAPON_PROPERTIES = ["finesse", "light", "heavy", "reach", "thrown", "dippable"];

function stats(item) {
  const rows = [
    ["Slot", [item.type, item.kind === "weapon" && item.handedness ? `${item.handedness}` : null]],
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

function whereToGet(item) {
  if (!item.acquisitions.length) {
    return item.where_to_find
      ? `<p class="prose">${linkify(item.where_to_find, item.where_to_find_links)}</p>`
      : `<p class="prose muted">bg3.wiki doesn't record where to find this item.</p>`;
  }
  return `<ol class="ways">${item.acquisitions
    .map((a) => {
      const where = a.act ? [ACT_LABELS[a.act], ...(a.path ?? [])].join(" › ") : "Anywhere";
      return `<li><p class="way-where">${esc(where)}</p><p class="way-how">${linkify(a.description ?? "No details recorded.", a.links)}</p></li>`;
    })
    .join("")}</ol>`;
}

/** Which party members plan around this item, and who gets it when it's contested. */
export function partyPlans(wanted) {
  if (!wanted.length) return "";
  const rows = wanted.map(
    ({ profile, entry }) => `
      <li>
        <p><a href="#party/${esc(profile.id)}/gear" data-close>${esc(profile.name)}</a> ${priorityTag(entry.priority)}</p>
        ${entry.note ? `<p class="prose">${esc(entry.note)}</p>` : ""}
        ${entry.claim ? `<p class="plan-claim">Who gets it: ${esc(entry.claim)}</p>` : ""}
      </li>`,
  );
  return `<h3>Party plans</h3><ul class="ways wanted">${rows.join("")}</ul>`;
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
          <p class="detail-kind">${esc(capitalize(item.rarity))} ${item.kind === "weapon" ? "weapon" : "equipment"}</p>
        </div>
      </header>
      <dl class="stats">${stats(item)}</dl>
      ${partyPlans(wanted)}
      <h3>Where to get it</h3>
      ${whereToGet(item)}
      ${item.notes ? `<h3>Notes</h3><p class="prose">${linkify(item.notes, item.notes_links)}</p>` : ""}
      ${abilityList("Passives", item.passives, abilities)}
      ${abilityList("Weapon passives", item.weapon_passives, abilities)}
      ${abilityList("Main-hand passives", item.passives_main_hand, abilities)}
      ${abilityList("Off-hand passives", item.passives_off_hand, abilities)}
      ${abilityList("Weapon actions", [...(item.weapon_actions ?? []), ...(item.special_weapon_actions ?? [])], abilities)}
      ${textBlock("Special", item.special)}
      ${textBlock("About", item.description)}
      ${item.quote ? `<blockquote class="quote">${esc(item.quote)}</blockquote>` : ""}
      ${item.bugs ? `<details class="bugs"><summary>Known bugs</summary><p class="prose">${esc(item.bugs)}</p></details>` : ""}
      ${variants}
      ${wiki ? `<p><a class="wiki-link" href="${esc(wiki)}" target="_blank" rel="noopener">Open on bg3.wiki</a></p>` : ""}
    </div>`;
  panel.hidden = false;
  panel.scrollTop = 0;
}
