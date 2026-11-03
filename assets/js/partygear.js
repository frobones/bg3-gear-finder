// The party gear overview: every character's picks for each slot, side by side, one act at a time.
//
// Route: #party/gear. Vesper's plan names a default per slot plus alternates; a friend's slot is a bucket
// whose first item is the first pick. Both read as "picks" first, then the rest under "Or".

import { esc, itemButton } from "./html.js";

export const PARTY_GEAR_ROUTE = "gear";

const SLOT_ORDER = ["Head", "Cloak", "Body", "Gloves", "Boots", "Amulet", "Rings", "Main hand", "Off hand", "Ranged"];
// Vesper's plan says "Chest" and lists each ring on its own row.
const SLOT_ALIASES = { Chest: "Body", Ring: "Rings" };
const ACT_ORDER = ["one", "two", "three"];

/** One profile's picks for an act, by slot: `picks` lead, `others` are alternates or further options. */
export function slotPicks(profile, act) {
  const bySlot = new Map();
  const loadout = (profile.loadouts ?? []).find((l) => l.act === act);
  for (const slot of loadout?.slots ?? []) {
    const name = SLOT_ALIASES[slot.slot] ?? slot.slot;
    if (!bySlot.has(name)) bySlot.set(name, { picks: [], others: [] });
    const cell = bySlot.get(name);
    const items = slot.items ?? [];
    if (slot.alternates) {
      cell.picks.push(...items);
      cell.others.push(...slot.alternates);
    } else {
      cell.picks.push(...items.slice(0, 1));
      cell.others.push(...items.slice(1));
    }
  }
  for (const cell of bySlot.values()) {
    cell.picks = [...new Set(cell.picks)];
    cell.others = [...new Set(cell.others)].filter((id) => !cell.picks.includes(id));
  }
  return bySlot;
}

/** The acts any profile has a loadout for, in play order, with their labels. */
export function partyActs(profiles) {
  const labels = new Map();
  for (const profile of profiles) for (const l of profile.loadouts ?? []) labels.set(l.act, l.label);
  return ACT_ORDER.filter((act) => labels.has(act)).map((act) => ({ act, label: labels.get(act) }));
}

function gearCell(cell, byId) {
  if (!cell || (!cell.picks.length && !cell.others.length)) return `<span class="muted">Nothing planned</span>`;
  const items = (ids) => ids.map((id) => `<div class="loadout-item">${itemButton(byId.get(id), 24)}</div>`).join("");
  const others = cell.others.length ? `<div class="gear-others"><span class="gear-others-label">Or</span>${items(cell.others)}</div>` : "";
  return `${items(cell.picks)}${others}`;
}

export function renderPartyGear(data, act) {
  const profiles = data.party.members.map((m) => (m.profile ? data.party.profiles.get(m.profile) : null)).filter(Boolean);
  const acts = partyActs(profiles);
  const shown = acts.find((a) => a.act === act) ?? acts[0];
  const buttons = acts
    .map(
      (a) => `<button type="button" class="segment" data-loadout-act="${esc(a.act)}" aria-pressed="${a === shown}">${esc(a.label)}</button>`,
    )
    .join("");
  const picks = profiles.map((p) => slotPicks(p, shown?.act));
  const slots = SLOT_ORDER.filter((slot) => picks.some((bySlot) => bySlot.has(slot)));
  const head = profiles
    .map((p) => `<th scope="col"><a href="#party/${esc(p.id)}">${esc(p.name)}</a><span class="row-sub">${esc(p.title)}</span></th>`)
    .join("");
  const rows = slots
    .map(
      (slot) => `
      <tr>
        <th scope="row">${esc(slot)}</th>
        ${profiles.map((p, i) => `<td data-label="${esc(p.name)}">${gearCell(picks[i].get(slot), data.byId)}</td>`).join("")}
      </tr>`,
    )
    .join("");
  return `
    <article class="party-gear">
      <a class="back-link" href="#party">All party members</a>
      <h2 class="profile-name">Party gear by act</h2>
      <p class="prose">Where each piece of gear is going at the end of each act. Items at the top of a cell are the
        picks; items under “Or” are alternates or other good options.</p>
      <div class="segments" role="group" aria-label="Act">${buttons}</div>
      <div class="table-wrap">
        <table class="loadout-table party-gear-table">
          <caption class="visually-hidden">Party gear for ${esc(shown?.label ?? "")}</caption>
          <thead><tr><th scope="col">Slot</th>${head}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </article>`;
}
