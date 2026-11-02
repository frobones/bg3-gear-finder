// Filter state read from the controls form, and the matching rules shared by both views.

import { ACT_LABELS, RARITIES, capitalize, esc, rarityClass } from "./html.js";

/** Fill the slot, act and rarity controls from the data. */
export function populateControls(form, data) {
  const typesByKind = { equipment: new Set(), weapon: new Set() };
  for (const item of data.items) typesByKind[item.kind].add(item.type);

  const group = (kind, label) =>
    `<optgroup label="${label}"><option value="kind:${kind}">All ${label.toLowerCase()}</option>` +
    [...typesByKind[kind]]
      .sort()
      .map((type) => `<option value="type:${esc(type)}">${esc(type)}</option>`)
      .join("") +
    "</optgroup>";
  form.slot.insertAdjacentHTML("beforeend", group("equipment", "Equipment") + group("weapon", "Weapons"));

  form.act.insertAdjacentHTML(
    "beforeend",
    data.regionOrder.acts.map((act) => `<option value="${act}">${ACT_LABELS[act]}</option>`).join("") +
      '<option value="anywhere">Anywhere or not recorded</option>',
  );

  form.querySelector("#rarity-chips").innerHTML = RARITIES.map(
    (rarity) =>
      `<label class="chip ${rarityClass(rarity)}"><input type="checkbox" name="rarity" value="${esc(rarity)}" /><span>${capitalize(rarity)}</span></label>`,
  ).join("");
}

export function readFilters(form) {
  const words = form.query.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return {
    words,
    slot: form.slot.value,
    act: form.act.value,
    rarities: new Set([...form.querySelectorAll('input[name="rarity"]:checked')].map((input) => input.value)),
    knownOnly: form.knownOnly.checked,
  };
}

export const isFiltering = (f) => f.words.length > 0 || f.slot || f.act || f.rarities.size > 0 || f.knownOnly;

function matchesSlot(item, slot) {
  if (!slot) return true;
  const [kind, value] = slot.split(/:(.*)/);
  return kind === "kind" ? item.kind === value : item.type === value;
}

function matchesAct(item, act) {
  if (!act) return true;
  if (act === "anywhere") return item.acquisitions.length === 0 || item.acts.has("anywhere");
  return item.acts.has(act);
}

export function matchesItem(item, f) {
  return (
    f.words.every((word) => item.searchText.includes(word)) &&
    matchesSlot(item, f.slot) &&
    matchesAct(item, f.act) &&
    (f.rarities.size === 0 || f.rarities.has(item.rarity)) &&
    (!f.knownOnly || item.has_location_data)
  );
}
