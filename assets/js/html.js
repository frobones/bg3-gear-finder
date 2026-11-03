// Shared rendering helpers: escaping, wiki links, and display labels.

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Escape any value for use in HTML text or a quoted attribute. */
export const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ESCAPES[c]);

export const RARITIES = ["common", "uncommon", "rare", "very rare", "legendary", "story"];

export const ACT_LABELS = { prologue: "Prologue", one: "Act 1", two: "Act 2", three: "Act 3" };
export const ACT_MARKERS = { prologue: "P", one: "1", two: "2", three: "3" };

export const rarityClass = (rarity) => `r-${String(rarity).replace(/\s+/g, "-")}`;

export const capitalize = (text) => (text ? text[0].toUpperCase() + text.slice(1) : "");

/** Only ever link back to bg3.wiki; the data file is a snapshot, not a trusted source of URLs. */
export const safeWikiUrl = (url) => (typeof url === "string" && url.startsWith("https://bg3.wiki/") ? url : null);

/** Escape `text` and turn the first occurrence of each link's text into a link to bg3.wiki. */
export function linkify(text, links = []) {
  let segments = [{ text: text ?? "" }];
  const ordered = [...links].sort((a, b) => b.text.length - a.text.length);
  for (const link of ordered) {
    const url = safeWikiUrl(link.url);
    if (!url || !link.text) continue;
    const index = segments.findIndex((s) => !s.url && s.text.includes(link.text));
    if (index === -1) continue;
    const { text: plain } = segments[index];
    const at = plain.indexOf(link.text);
    segments.splice(
      index,
      1,
      { text: plain.slice(0, at) },
      { text: link.text, url },
      { text: plain.slice(at + link.text.length) },
    );
  }
  return segments
    .map((s) => (s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.text)}</a>` : esc(s.text)))
    .join("");
}

/** Item icon; lists lazy-load theirs, single icons such as the detail panel's load right away. */
export function itemIcon(item, size, lazy = true) {
  if (!item.icon_url) return `<span class="item-icon item-icon-empty" style="--size:${size}px"></span>`;
  return `<img class="item-icon" src="${esc(item.icon_url)}" alt="" width="${size}" height="${size}"${lazy ? ' loading="lazy"' : ""} decoding="async" />`;
}

/** The button that opens an item's details, shown wherever an item is named. */
export function itemButton(item, iconSize = 28) {
  return `<button type="button" class="item-link ${rarityClass(item.rarity)}" data-item="${esc(item.id)}">${itemIcon(item, iconSize)}<span class="item-name">${esc(item.label)}</span></button>`;
}

/** "Act 2, Last Light Inn" for an acquisition with a place; otherwise a plain explanation. */
export function whenLabel(item) {
  if (item.earliest) return `${ACT_LABELS[item.earliest.act]}, ${item.earliest.zone}`;
  return item.acquisitions.length ? "Anywhere" : "Not recorded";
}

export const formatNumber = (n) => (n == null ? "" : Number(n).toLocaleString("en-US"));

/** How strongly a party member wants an item, as written in their profile. */
export const PRIORITY_LABELS = {
  core: "Core",
  high: "High",
  swap: "Swap",
  matchup: "Matchup",
  optional: "Optional",
  party: "Party decision",
  yield: "Leave for party",
};

export const priorityTag = (priority) =>
  `<span class="tag tag-${esc(priority)}">${esc(PRIORITY_LABELS[priority] ?? priority)}</span>`;

/** What an item is good for, on an options profile where nothing is ranked. */
export const TAG_LABELS = {
  dc: "Spell DC",
  radiant: "Radiant",
  concentration: "Concentration",
  survival: "Survival",
  healing: "Healing",
  damage: "Damage",
  utility: "Utility",
};

/** A gear entry's tags: its priority on a plan profile, or what it's good for on an options profile. */
export const entryTags = (entry) =>
  entry.priority
    ? priorityTag(entry.priority)
    : (entry.tags ?? []).map((t) => `<span class="tag tag-${esc(t)}">${esc(TAG_LABELS[t] ?? t)}</span>`).join("");
