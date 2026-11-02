// "All items" view: a sortable table of every item that passes the filters.

import { capitalize, esc, formatNumber, itemButton, whenLabel } from "./html.js";

const COLUMNS = [
  { key: "name", label: "Item", sort: (i) => i.label.toLowerCase(), cell: (i) => itemButton(i) },
  { key: "slot", label: "Slot", sort: (i) => i.type ?? "", cell: (i) => esc(i.type) },
  { key: "rarity", label: "Rarity", sort: (i) => i.rarityRank, cell: (i) => esc(capitalize(i.rarity)) },
  {
    key: "when",
    label: "First found",
    sort: (i) => i.earliest?.order ?? null,
    cell: (i) => esc(whenLabel(i)),
  },
  {
    key: "stat",
    label: "AC / damage",
    numeric: true,
    sort: (i) => i.armour_class ?? i.damageAverage,
    cell: (i) => (i.kind === "weapon" ? esc(i.damage) : esc(i.armour_class)),
  },
  {
    key: "price",
    label: "Value",
    numeric: true,
    sort: (i) => i.price ?? null,
    cell: (i) => formatNumber(i.price),
  },
  {
    key: "weight",
    label: "Weight",
    numeric: true,
    sort: (i) => i.weight_kg ?? null,
    cell: (i) => (i.weight_kg == null ? "" : `${i.weight_kg} kg`),
  },
];

function compare(a, b) {
  if (a === b) return 0;
  if (typeof a === "string") return a.localeCompare(b);
  return a < b ? -1 : 1;
}

/** Sort by the column, keeping items with no value for it at the bottom in either direction. */
export function sortItems(items, sort) {
  const column = COLUMNS.find((c) => c.key === sort.key);
  const direction = sort.descending ? -1 : 1;
  return [...items].sort((a, b) => {
    const [va, vb] = [column.sort(a), column.sort(b)];
    if ((va == null) !== (vb == null)) return va == null ? 1 : -1;
    return (va == null ? 0 : direction * compare(va, vb)) || a.label.localeCompare(b.label);
  });
}

export function renderTable(container, items, sort) {
  const header = COLUMNS.map((c) => {
    const active = c.key === sort.key;
    const ariaSort = active ? (sort.descending ? "descending" : "ascending") : "none";
    return `<th scope="col" aria-sort="${ariaSort}" class="${c.numeric ? "num" : ""}"><button type="button" class="sort-button" data-sort="${c.key}">${c.label}</button></th>`;
  }).join("");

  const rows = sortItems(items, sort)
    .map(
      (item) =>
        `<tr>${COLUMNS.map((c) => `<td class="${c.numeric ? "num" : ""} col-${c.key}">${c.cell(item)}</td>`).join("")}</tr>`,
    )
    .join("");

  container.innerHTML = items.length
    ? `<div class="table-wrap"><table class="gear-table"><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table></div>`
    : `<p class="status">No gear matches these filters. Try removing a filter or searching for something shorter.</p>`;
}

/** Clicking the active column flips direction; a new column starts ascending (value columns start high). */
export function nextSort(current, key) {
  if (current.key === key) return { key, descending: !current.descending };
  const column = COLUMNS.find((c) => c.key === key);
  return { key, descending: Boolean(column.numeric) };
}
