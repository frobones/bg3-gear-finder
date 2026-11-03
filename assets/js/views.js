// The page's top-level views, read from the address bar. Party comes first and opens by default.

export const VIEWS = ["party", "journey", "items", "album"];

/** The view a hash such as "#items" or "#party/vesper/gear" asks for; anything else opens the first view. */
export function viewFromHash(hash) {
  const name = hash.replace(/^#/, "").split("/")[0];
  return VIEWS.includes(name) ? name : VIEWS[0];
}
