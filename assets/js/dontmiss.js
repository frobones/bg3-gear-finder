// "Don't miss" view: for each act, the planned items a story choice can lose and when that act's places close.

import { matchesItem } from "./filters.js";
import { ACT_LABELS, ACT_MARKERS, esc, itemButton } from "./html.js";
import { plural, renderStage } from "./journey.js";

function renderWarning(entry, shown, byId) {
  return `<li><span class="dont-miss-items">${shown.map((id) => itemButton(byId.get(id))).join("")}</span><p>${esc(entry.text)}</p></li>`;
}

export function renderDontMiss(container, data, filters) {
  // The act filter picks the act's warnings, not the items: a warning can name gear found in a later act.
  const visible = new Set(data.items.filter((item) => matchesItem(item, { ...filters, act: "" })).map((item) => item.id));
  const stages = data.regionOrder.acts
    .filter((act) => !filters.act || filters.act === act)
    .map((act) => {
      const warnings = data.party.dontMiss
        .filter((entry) => entry.act === act)
        .map((entry) => ({ entry, shown: entry.items.filter((id) => visible.has(id)) }))
        .filter(({ shown }) => shown.length);
      if (!warnings.length) return "";
      const closes = data.party.dontMissCloses[act];
      return renderStage({
        id: act,
        marker: ACT_MARKERS[act],
        title: ACT_LABELS[act],
        note: plural(warnings.length, "warning"),
        body: `<div class="dont-miss">
          ${closes ? `<p class="dont-miss-closes">${esc(closes)}</p>` : ""}
          <ul>${warnings.map(({ entry, shown }) => renderWarning(entry, shown, data.byId)).join("")}</ul>
        </div>`,
      });
    })
    .join("");

  container.innerHTML = stages
    ? `<p class="dont-miss-intro">Gear the party plans to use that a story choice can lose.</p><div class="journey">${stages}</div>`
    : `<p class="status">No warnings match these filters. Try removing a filter or searching for something shorter.</p>`;
}
