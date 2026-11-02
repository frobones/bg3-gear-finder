// Loads the snapshot in data/ and links items to the ways you can get them.

import { RARITIES } from "./html.js";

const FILES = ["items", "acquisitions", "region_order", "meta", "abilities"];

async function loadJson(name) {
  const response = await fetch(`data/${name}.json`);
  if (!response.ok) throw new Error(`GET data/${name}.json failed with HTTP ${response.status}`);
  return response.json();
}

/** Average roll of a damage string such as "1d8 + 1" or "2d6", used for sorting. */
export function averageDamage(damage) {
  if (!damage) return null;
  let total = 0;
  for (const term of damage.replace(/\s+/g, "").match(/[+-]?[^+-]+/g) ?? []) {
    const dice = term.match(/^([+-]?)(\d*)d(\d+)$/i);
    if (dice) total += (dice[1] === "-" ? -1 : 1) * Number(dice[2] || 1) * ((Number(dice[3]) + 1) / 2);
    else if (/^[+-]?\d+$/.test(term)) total += Number(term);
  }
  return total;
}

const byOrder = (a, b) => (a.order ?? Infinity) - (b.order ?? Infinity);

export async function loadData() {
  const [items, acquisitions, regionOrder, meta, abilities] = await Promise.all(FILES.map(loadJson));

  const acquisitionsByItem = new Map();
  for (const acquisition of acquisitions) {
    if (!acquisitionsByItem.has(acquisition.item)) acquisitionsByItem.set(acquisition.item, []);
    acquisitionsByItem.get(acquisition.item).push(acquisition);
  }

  for (const item of items) {
    item.label = item.name ?? item.id;
    item.acquisitions = (acquisitionsByItem.get(item.id) ?? []).sort(byOrder);
    item.earliest = item.acquisitions.find((a) => a.order != null) ?? null;
    item.acts = new Set(item.acquisitions.map((a) => a.act ?? "anywhere"));
    item.rarityRank = RARITIES.indexOf(item.rarity);
    item.damageAverage = averageDamage(item.damage);
    item.searchText = [
      item.label,
      item.type,
      item.where_to_find,
      ...item.acquisitions.flatMap((a) => [a.description, ...(a.path ?? [])]),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }

  return {
    items,
    byId: new Map(items.map((i) => [i.id, i])),
    acquisitions,
    regionOrder,
    meta,
    abilities: new Map(abilities.map((a) => [a.id, a])),
  };
}
