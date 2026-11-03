// A profile's gear plan: wanted items in play order with pick-up checkboxes, then the endgame loadout.

import { abilityName } from "./abilities.js";
import { ACT_LABELS, entryTags, esc, itemButton, linkify } from "./html.js";

const ACT_ORDER = ["prologue", "one", "two", "three", "anywhere"];
const GROUP_LABELS = { ...ACT_LABELS, anywhere: "Anywhere or not recorded" };

/** Resolve plan entries against the snapshot and sort them into acts by where the item first turns up. */
export function planGroups(gear, byId) {
  const groups = new Map(ACT_ORDER.map((act) => [act, []]));
  for (const entry of gear) {
    if (entry.priority === "yield") continue;
    const item = entry.item ? byId.get(entry.item) : null;
    // Places come from the wiki; the profile's own act and "where" fill in only when the wiki records none.
    const act = item?.earliest?.act ?? entry.act ?? "anywhere";
    groups.get(act).push({ entry, item, order: item?.earliest?.order ?? Infinity });
  }
  for (const rows of groups.values()) rows.sort((a, b) => a.order - b.order);
  return [...groups].filter(([, rows]) => rows.length);
}

function where(item, entry) {
  const first = item ? (item.earliest ?? item.acquisitions[0]) : null;
  if (!first) {
    if (item?.where_to_find) return linkify(item.where_to_find, item.where_to_find_links);
    return entry.where ? esc(entry.where) : "bg3.wiki doesn't record where to find this.";
  }
  const place = first.act ? `${[ACT_LABELS[first.act], ...(first.path ?? []).slice(-2)].join(" › ")}: ` : "";
  const more = item.acquisitions.length > 1 ? ` (${item.acquisitions.length} ways to get it)` : "";
  return `${esc(place)}${esc(first.description ?? "No details recorded.")}${more}`;
}

function planRow({ entry, item }, got) {
  const id = entry.item ?? entry.name;
  const label = item?.label ?? entry.name;
  const name = item ? itemButton(item) : `<span class="plain-item">${esc(entry.name)}</span>`;
  return `
    <li class="plan-row${got ? " is-got" : ""}">
      <input type="checkbox" class="plan-check" data-progress="got" value="${esc(id)}"${got ? " checked" : ""}
        aria-label="Picked up ${esc(label)}" />
      <div class="plan-body">
        <div class="plan-title">${name}${entryTags(entry)}</div>
        ${entry.note ? `<p class="plan-note">${esc(entry.note)}</p>` : ""}
        ${entry.claim ? `<p class="plan-claim">Who gets it: ${esc(entry.claim)}</p>` : ""}
        <p class="plan-where">${where(item, entry)}</p>
      </div>
    </li>`;
}

/** An options profile's slot: a bucket of good picks, each with what it's good for. */
function bucketTable(loadout, byId, gear) {
  const tagsOf = new Map(gear.map((e) => [e.item, e]));
  const rows = loadout.slots
    .map(
      (slot) => `
      <tr>
        <th scope="row">${esc(slot.slot)}</th>
        <td>${slot.items
          .map((id) => `<div class="loadout-item">${itemButton(byId.get(id), 24)}${tagsOf.has(id) ? entryTags(tagsOf.get(id)) : ""}</div>`)
          .join("")}</td>
      </tr>`,
    )
    .join("");
  return `
    <p class="prose">${esc(loadout.intro)}</p>
    <div class="table-wrap">
      <table class="loadout-table bucket-table">
        <caption class="visually-hidden">Good picks for ${esc(loadout.label)}</caption>
        <thead><tr><th scope="col">Slot</th><th scope="col">Good picks</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function loadoutTable(loadout, byId, abilities) {
  const cell = (ids) =>
    ids
      .map((id) => `<div class="loadout-item">${itemButton(byId.get(id), 24)}</div>`)
      .join("");
  const rows = loadout.slots
    .map(
      (slot) => `
      <tr>
        <th scope="row">${esc(slot.slot)}</th>
        <td>${slot.items ? cell(slot.items) : ""}${slot.abilities ? slot.abilities.map((n) => abilityName(n, abilities)).join(", ") : ""}
          ${!slot.items && !slot.abilities ? `<span class="muted">No pick yet</span>` : ""}
          ${slot.note ? `<p class="muted small">${esc(slot.note)}</p>` : ""}</td>
        <td class="alternates" data-label="Alternates">${slot.alternates?.length ? cell(slot.alternates) : `<span class="muted">None</span>`}</td>
      </tr>`,
    )
    .join("");
  return `
    <p class="prose">${esc(loadout.intro)}</p>
    <div class="table-wrap">
      <table class="loadout-table">
        <caption class="visually-hidden">End of ${esc(loadout.label)} loadout</caption>
        <thead><tr><th scope="col">Slot</th><th scope="col">Default</th><th scope="col">Alternates</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${loadout.armour_class ? `<p class="prose">${esc(loadout.armour_class)}</p>` : ""}`;
}

/** Loadouts for the end of each act, one shown at a time behind act buttons. */
function loadouts(profile, byId, abilities, act) {
  const shown = profile.loadouts.find((l) => l.act === act) ?? profile.loadouts[0];
  const buttons = profile.loadouts
    .map(
      (l) =>
        `<button type="button" class="segment" data-loadout-act="${esc(l.act)}" aria-pressed="${l === shown}">${esc(l.label)}</button>`,
    )
    .join("");
  const options = profile.style === "options";
  return `
    <h3 id="loadout-heading">${options ? "Good picks by act" : "End-of-act loadout"}</h3>
    <div class="segments" role="group" aria-labelledby="loadout-heading">${buttons}</div>
    ${options ? bucketTable(shown, byId, profile.gear) : loadoutTable(shown, byId, abilities)}`;
}

export function renderGearTab(profile, data, progress, hideGot, loadoutAct) {
  const got = new Set(progress.got);
  const groups = planGroups(profile.gear, data.byId);
  const total = groups.reduce((n, [, rows]) => n + rows.length, 0);
  const done = groups.reduce((n, [, rows]) => n + rows.filter((r) => got.has(r.entry.item ?? r.entry.name)).length, 0);

  const sections = groups
    .map(([act, rows]) => {
      const shown = hideGot ? rows.filter((r) => !got.has(r.entry.item ?? r.entry.name)) : rows;
      const body = shown.length
        ? `<ul class="plan-list">${shown.map((r) => planRow(r, got.has(r.entry.item ?? r.entry.name))).join("")}</ul>`
        : `<p class="muted">Everything here is picked up.</p>`;
      return `<section class="plan-act"><h3>${esc(GROUP_LABELS[act])}</h3>${body}</section>`;
    })
    .join("");

  const yielded = profile.gear.filter((e) => e.priority === "yield");
  const leave = yielded.length
    ? `<section class="plan-act">
        <h3>Leave for the party</h3>
        <ul class="plan-list">${yielded
          .map(
            (e) => `<li class="plan-row plan-row-plain"><div class="plan-body">
              <div class="plan-title">${itemButton(data.byId.get(e.item))}</div>
              <p class="plan-claim">${esc(e.claim)}</p></div></li>`,
          )
          .join("")}</ul>
      </section>`
    : "";

  return `
    <div class="plan-tools">
      <p class="plan-count" tabindex="-1" aria-live="polite">${done} of ${total} picked up</p>
      <label class="toggle"><input type="checkbox" data-hide-got${hideGot ? " checked" : ""} /><span>Hide picked-up items</span></label>
    </div>
    ${sections}
    ${leave}
    ${loadouts(profile, data.byId, data.abilities, loadoutAct)}`;
}
