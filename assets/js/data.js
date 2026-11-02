// Loads the snapshot in data/ and links items to the ways you can get them.

import { RARITIES } from "./html.js";

const FILES = ["items", "acquisitions", "region_order", "meta", "abilities", "party/party"];

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

/** Map each item to the party members whose profile mentions it in their gear plan. */
export function wantedByItem(profiles) {
  const wanted = new Map();
  for (const profile of profiles) {
    for (const entry of profile.gear) {
      if (!entry.item) continue;
      if (!wanted.has(entry.item)) wanted.set(entry.item, []);
      wanted.get(entry.item).push({ profile, entry });
    }
  }
  return wanted;
}

export async function loadData() {
  const [items, acquisitions, regionOrder, meta, abilities, roster] = await Promise.all(FILES.map(loadJson));
  const profiles = await Promise.all(
    roster.members.filter((m) => m.profile).map((m) => loadJson(`party/${m.profile}`)),
  );

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
      item.notes,
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
    party: {
      members: roster.members,
      profiles: new Map(profiles.map((p) => [p.id, p])),
      wantedBy: wantedByItem(profiles),
    },
  };
}
