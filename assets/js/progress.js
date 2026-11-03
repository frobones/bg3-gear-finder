// Per-character progress (level reached, items picked up, scrolls scribed, powers taken), kept in this browser.
//
// Storage can be missing or blocked (private windows, cleared site data); the page then works without it and
// nothing is remembered.

const KEY_PREFIX = "bg3-gear-finder:profile:";
const MAX_LEVEL = 12;
export const PROFILE_TABS = ["build", "level", "gear", "scrolls", "illithid", "playbook"];
// A full build plan (Vesper) and an options menu for a friend to choose from show different tabs.
export const TABS_BY_STYLE = {
  plan: ["level", "gear", "scrolls", "illithid", "playbook"],
  options: ["build", "level", "gear", "playbook"],
};
export const tabsFor = (profile) => TABS_BY_STYLE[profile.style ?? "plan"];
const LISTS = ["got", "scribed", "taken"];

export const emptyProgress = () => ({ level: 0, tab: null, got: [], scribed: [], taken: [] });

/** Keep only well-formed fields from stored JSON; anything else falls back to the empty value. */
export function sanitizeProgress(stored) {
  const progress = emptyProgress();
  if (!stored || typeof stored !== "object") return progress;
  if (Number.isInteger(stored.level) && stored.level >= 0 && stored.level <= MAX_LEVEL) progress.level = stored.level;
  if (PROFILE_TABS.includes(stored.tab)) progress.tab = stored.tab;
  for (const list of LISTS) {
    if (Array.isArray(stored[list])) progress[list] = stored[list].filter((v) => typeof v === "string");
  }
  return progress;
}

export function loadProgress(profileId) {
  let raw = null;
  try {
    raw = localStorage.getItem(KEY_PREFIX + profileId);
  } catch (error) {
    console.warn("Progress can't be read from this browser's storage, so nothing is remembered.", error);
    return emptyProgress();
  }
  if (raw == null) return emptyProgress();
  try {
    return sanitizeProgress(JSON.parse(raw));
  } catch (error) {
    console.warn(`Stored progress for ${profileId} isn't valid JSON; starting fresh.`, error);
    return emptyProgress();
  }
}

export function saveProgress(profileId, progress) {
  try {
    localStorage.setItem(KEY_PREFIX + profileId, JSON.stringify(progress));
  } catch (error) {
    console.warn("Progress can't be saved in this browser's storage; it lasts until the page reloads.", error);
  }
}

/** Add or remove `value` in one of the progress lists. */
export function toggleInList(progress, list, value, on) {
  const set = new Set(progress[list]);
  if (on) set.add(value);
  else set.delete(value);
  return { ...progress, [list]: [...set] };
}
