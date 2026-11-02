// A profile's gear plan: wanted items in play order with pick-up checkboxes, then the endgame loadout.

import { abilityName } from "./abilities.js";
import { ACT_LABELS, esc, itemButton, linkify, priorityTag } from "./html.js";

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
    return entry.where ? `From the build guide: ${esc(entry.where)}` : "bg3.wiki doesn't record where to find this.";
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
        <div class="plan-title">${name}${priorityTag(entry.priority)}</div>
        ${entry.note ? `<p class="plan-note">${esc(entry.note)}</p>` : ""}
        ${entry.claim ? `<p class="plan-claim">Who gets it: ${esc(entry.claim)}</p>` : ""}
        <p class="plan-where">${where(item, entry)}</p>
      </div>
    </li>`;
}

function loadout(profile, byId, abilities) {
  const cell = (ids) =>
    ids
      .map((id) => byId.get(id))
      .map((item) => itemButton(item, 24))
      .join("");
  const rows = profile.loadout.slots
    .map(
      (slot) => `
      <tr>
        <th scope="row">${esc(slot.slot)}</th>
        <td>${slot.items ? cell(slot.items) : ""}${slot.abilities ? slot.abilities.map((n) => abilityName(n, abilities)).join(", ") : ""}
          ${slot.note ? `<p class="muted small">${esc(slot.note)}</p>` : ""}</td>
        <td class="alternates">${slot.alternates?.length ? cell(slot.alternates) : `<span class="muted">None</span>`}</td>
      </tr>`,
    )
    .join("");
  return `
    <h3>Endgame loadout</h3>
    <div class="table-wrap">
      <table class="loadout-table">
        <thead><tr><th scope="col">Slot</th><th scope="col">Default</th><th scope="col">Alternates</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <p class="prose">${esc(profile.loadout.armour_class)}</p>`;
}

export function renderGearTab(profile, data, progress, hideGot) {
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
    ${loadout(profile, data.byId, data.abilities)}`;
}
