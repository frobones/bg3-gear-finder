// "Journey" view: acts in play order, each zone a waypoint listing what you can pick up there.

import { ACT_LABELS, ACT_MARKERS, esc, itemButton, linkify, rarityClass } from "./html.js";

const OPEN_ALL_BELOW = 120; // with this few finds, every zone starts expanded

function groupBy(list, key) {
  const groups = new Map();
  for (const entry of list) {
    const k = key(entry);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(entry);
  }
  return groups;
}

function renderFind(acquisition, item) {
  return `<li class="find ${rarityClass(item.rarity)}">
    <div class="find-item">${itemButton(item)}<span class="find-slot">${esc(item.type)}</span></div>
    <p class="find-how">${linkify(acquisition.description ?? item.where_to_find ?? "No details recorded.", acquisition.links)}</p>
  </li>`;
}

function renderPlaces(acquisitions, byId, zone) {
  const places = groupBy(acquisitions, (a) => a.location ?? "");
  return [...places]
    .map(([place, finds]) => {
      const path = finds[0].path ?? [];
      const trail = path.slice(Math.max(0, path.indexOf(zone) + 1));
      const heading = trail.length ? trail.join(" › ") : place === zone ? "" : place;
      return `<div class="place">
        ${heading ? `<h4 class="place-name">${esc(heading)}</h4>` : ""}
        <ul class="finds">${finds.map((a) => renderFind(a, byId.get(a.item))).join("")}</ul>
      </div>`;
    })
    .join("");
}

function renderZone(zone, acquisitions, byId, open) {
  return `<details class="zone"${open ? " open" : ""}>
    <summary><span class="zone-name">${esc(zone)}</span><span class="zone-count">${acquisitions.length}</span></summary>
    ${renderPlaces(acquisitions, byId, zone)}
  </details>`;
}

function renderStage({ id, marker, title, note, body }) {
  return `<section class="stage" aria-labelledby="stage-${id}">
    <header class="stage-head">
      <span class="stage-marker" aria-hidden="true">${esc(marker)}</span>
      <h2 id="stage-${id}">${esc(title)}</h2>
      <p class="stage-note">${esc(note)}</p>
    </header>
    ${body}
  </section>`;
}

const plural = (n, word) => `${n.toLocaleString("en-US")} ${word}${n === 1 ? "" : "s"}`;

export function renderJourney(container, data, items, filters) {
  const visible = new Set(items.map((i) => i.id));
  const shown = data.acquisitions.filter((a) => visible.has(a.item));
  const open = Boolean(filters.words.length) || shown.length < OPEN_ALL_BELOW;
  const stages = [];

  for (const act of data.regionOrder.acts) {
    if (filters.act && filters.act !== act) continue;
    const inAct = groupBy(
      shown.filter((a) => a.act === act),
      (a) => a.zone,
    );
    const zones = data.regionOrder.zones[act].filter((zone) => inAct.has(zone));
    if (!zones.length) continue;
    const count = zones.reduce((n, zone) => n + inAct.get(zone).length, 0);
    stages.push(
      renderStage({
        id: act,
        marker: ACT_MARKERS[act],
        title: ACT_LABELS[act],
        note: `${plural(count, "find")} across ${plural(zones.length, "area")}`,
        body: zones.map((zone) => renderZone(zone, inAct.get(zone), data.byId, open)).join(""),
      }),
    );
  }

  if (!filters.act || filters.act === "anywhere") {
    const anywhere = shown.filter((a) => a.act == null);
    if (anywhere.length) {
      stages.push(
        renderStage({
          id: "anywhere",
          marker: "~",
          title: "Anywhere",
          note: "Found in many places, or the wiki doesn't name one",
          body: renderZone("Anywhere in the game", anywhere, data.byId, open),
        }),
      );
    }
    const unrecorded = items.filter((i) => i.acquisitions.length === 0);
    if (unrecorded.length) {
      stages.push(
        renderStage({
          id: "unrecorded",
          marker: "?",
          title: "Not recorded",
          note: "bg3.wiki has no location for these: often basic or spell-summoned gear",
          body: `<details class="zone"${open ? " open" : ""}>
            <summary><span class="zone-name">Items without a location</span><span class="zone-count">${unrecorded.length}</span></summary>
            <ul class="finds finds-compact">${unrecorded
              .map(
                (i) =>
                  `<li class="find ${rarityClass(i.rarity)}"><div class="find-item">${itemButton(i)}<span class="find-slot">${esc(i.type)}</span></div></li>`,
              )
              .join("")}</ul>
          </details>`,
        }),
      );
    }
  }

  container.innerHTML = stages.length
    ? `<div class="journey-tools"><button type="button" class="text-button" data-zones="open">Expand all</button><button type="button" class="text-button" data-zones="close">Collapse all</button></div><div class="journey">${stages.join("")}</div>`
    : `<p class="status">No gear matches these filters. Try removing a filter or searching for something shorter.</p>`;
}
