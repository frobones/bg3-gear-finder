// The page's views, read from the address bar, and the two sections they belong to. Home opens by default.

export const SECTIONS = {
  party: ["home", "party", "album"],
  gear: ["dont-miss", "journey", "items"],
};

export const VIEWS = Object.values(SECTIONS).flat();

/** The view a hash such as "#items" or "#party/vesper/gear" asks for; anything else opens Home. */
export function viewFromHash(hash) {
  const name = hash.replace(/^#/, "").split("/")[0];
  return VIEWS.includes(name) ? name : VIEWS[0];
}

/** "party" or "gear": the section a view belongs to. */
export function sectionOf(view) {
  return Object.keys(SECTIONS).find((section) => SECTIONS[section].includes(view));
}
