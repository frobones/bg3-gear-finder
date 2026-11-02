// Entry point: loads the snapshot, wires the controls, and renders the chosen view.

import { loadData } from "./data.js";
import { renderDetail } from "./detail.js";
import { isFiltering, matchesItem, populateControls, readFilters } from "./filters.js";
import { esc } from "./html.js";
import { renderJourney } from "./journey.js";
import { nextSort, renderTable } from "./table.js";

const SEARCH_DELAY_MS = 150;
const VIEWS = ["journey", "items"];

const form = document.getElementById("controls");
const view = document.getElementById("view");
const detail = document.getElementById("detail");
const resultCount = document.getElementById("result-count");

let data = null;
let sort = { key: "when", descending: false };
let lastOpener = null;
let collapsingZone = null;

const currentView = () => (VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : "journey");

function render() {
  const filters = readFilters(form);
  const items = data.items.filter((item) => matchesItem(item, filters));
  const name = currentView();

  for (const link of document.querySelectorAll("[data-view]")) {
    if (link.dataset.view === name) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  resultCount.textContent = isFiltering(filters)
    ? `${items.length.toLocaleString("en-US")} of ${data.items.length.toLocaleString("en-US")} items`
    : `${data.items.length.toLocaleString("en-US")} items`;

  if (name === "items") renderTable(view, items, sort);
  else renderJourney(view, data, items, filters);
}

function openDetail(id, opener) {
  const item = data.byId.get(id);
  if (!item) return;
  lastOpener = opener;
  renderDetail(detail, item);
  document.body.classList.add("detail-open");
  detail.querySelector("[data-close]").focus({ preventScroll: true });
}

function closeDetail() {
  detail.hidden = true;
  document.body.classList.remove("detail-open");
  lastOpener?.focus({ preventScroll: true });
}

function wireEvents() {
  let searchTimer = null;
  form.addEventListener("input", (event) => {
    clearTimeout(searchTimer);
    if (event.target.name === "query") searchTimer = setTimeout(render, SEARCH_DELAY_MS);
    else render();
  });
  form.addEventListener("submit", (event) => event.preventDefault());
  form.addEventListener("reset", () => setTimeout(render)); // runs after the browser clears the fields

  window.addEventListener("hashchange", render);

  document.addEventListener("click", (event) => {
    const itemLink = event.target.closest("[data-item]");
    if (itemLink) return openDetail(itemLink.dataset.item, itemLink);
    if (event.target.closest("[data-close]")) return closeDetail();
    const sortButton = event.target.closest("[data-sort]");
    if (sortButton) {
      sort = nextSort(sort, sortButton.dataset.sort);
      render();
      return view.querySelector(`[data-sort="${sortButton.dataset.sort}"]`)?.focus();
    }
    const zones = event.target.closest("[data-zones]");
    if (zones) {
      for (const zone of view.querySelectorAll("details.zone")) zone.open = zones.dataset.zones === "open";
      return;
    }
    const closeZone = event.target.closest("[data-close-zone]");
    if (closeZone) {
      collapsingZone = closeZone.closest("details.zone");
      collapsingZone.open = false;
      return;
    }
    const summary = event.target.closest("details.zone > summary");
    if (summary) collapsingZone = summary.parentElement;
  });

  // After someone collapses an area from deep inside it, bring its header back into view rather than
  // leaving them far down the page. Bulk "Collapse all" isn't tracked, so it never scrolls.
  // (Toggle events don't bubble, hence the capture listener.)
  document.addEventListener(
    "toggle",
    (event) => {
      // Chromium never starts lazy images that were inside a closed <details>, so load an area's icons
      // when it opens.
      if (event.target.open) {
        for (const img of event.target.querySelectorAll('img[loading="lazy"]')) img.loading = "eager";
      }
      if (event.target !== collapsingZone) return;
      collapsingZone = null;
      if (!event.target.open && event.target.getBoundingClientRect().top < 0) {
        event.target.scrollIntoView({ block: "start" });
      }
    },
    true,
  );

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !detail.hidden) closeDetail();
  });

  // Hide icons the wiki no longer serves instead of showing a broken image.
  document.addEventListener("error", (event) => event.target.classList?.add("item-icon-missing"), true);
}

function renderColophon() {
  const date = new Date(data.meta.snapshot_utc).toLocaleDateString("en-US", { dateStyle: "long" });
  document.getElementById("colophon").innerHTML =
    `Item data and icons from <a href="https://bg3.wiki/" target="_blank" rel="noopener">bg3.wiki</a>, ` +
    `used under <a href="${esc(data.meta.license_url)}" target="_blank" rel="noopener">${esc(data.meta.license.replace("Content from bg3.wiki, ", ""))}</a>. ` +
    `Snapshot taken ${esc(date)}. Not affiliated with Larian Studios.`;
}

async function start() {
  try {
    data = await loadData();
  } catch (error) {
    view.innerHTML =
      `<p class="status status-error">The gear data didn't load. Check that the data folder exists ` +
      `(run <code>python3 scripts/fetch_wiki.py</code> to create it), serve this folder with ` +
      `<code>python3 -m http.server</code>, then reload the page.</p>`;
    throw error; // keeps the technical detail in the browser console
  }
  populateControls(form, data);
  wireEvents();
  renderColophon();
  render();
}

start();
