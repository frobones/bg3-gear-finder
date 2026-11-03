// Album: screenshots from the party's sessions, grouped by the day they were played, with a full-size viewer.
//
// Shots and captions come from data/album.json, which scripts/build_album.py writes. Selecting a thumbnail
// opens the viewer; arrow keys or a swipe move between shots and Escape closes it.

import { esc } from "./html.js";
import { viewFromHash } from "./views.js";

const SWIPE_MIN_PX = 40;

let shots = null;
let order = [];

/** Shots grouped by the day they were taken, newest day first; shots within a day stay in time order. */
export function groupByDay(list) {
  const days = new Map();
  for (const shot of list) {
    const day = shot.taken.slice(0, 10);
    if (!days.has(day)) days.set(day, []);
    days.get(day).push(shot);
  }
  return [...days].sort(([a], [b]) => b.localeCompare(a)).map(([day, dayShots]) => ({ day, shots: dayShots }));
}

/** "November 1, 2026" for "2026-11-01". Noon keeps the date the same in every time zone. */
export function dayLabel(day) {
  return new Date(`${day}T12:00:00`).toLocaleDateString("en-US", { dateStyle: "long" });
}

const altText = (shot) => shot.caption || `Screenshot from ${dayLabel(shot.taken.slice(0, 10))}`;

/** The album page: a heading and a grid of thumbnails for each play session. */
export function albumHtml(list) {
  if (!list.length) return `<p class="status">No screenshots yet. Add some to album/ and run <code>python3 scripts/build_album.py</code>.</p>`;
  let index = 0;
  const sessions = groupByDay(list).map(({ day, shots: dayShots }) => {
    const cards = dayShots.map((shot) => {
      const card = `
        <li>
          <figure class="album-card">
            <button type="button" class="album-shot" data-shot="${index}">
              <img src="assets/album/thumbs/${esc(shot.file)}.jpg" alt="${esc(altText(shot))}" width="640" height="360" loading="lazy" decoding="async" />
            </button>
            ${shot.caption ? `<figcaption>${esc(shot.caption)}</figcaption>` : ""}
          </figure>
        </li>`;
      index += 1;
      return card;
    });
    const count = `${dayShots.length} screenshot${dayShots.length === 1 ? "" : "s"}`;
    return `
      <section class="album-session" aria-labelledby="session-${day}">
        <h2 id="session-${day}">${esc(dayLabel(day))} <span class="row-sub">${count}</span></h2>
        <ul class="album-grid">${cards.join("")}</ul>
      </section>`;
  });
  return `<div class="album">${sessions.join("")}</div>`;
}

function viewerDialog() {
  const dialog = document.createElement("dialog");
  dialog.className = "album-viewer";
  dialog.setAttribute("aria-label", "Screenshot");
  dialog.innerHTML = `
    <div class="viewer-bar">
      <p class="viewer-count" aria-live="polite"></p>
      <button type="button" class="viewer-button" data-viewer="close">Close</button>
    </div>
    <img class="viewer-image" alt="" />
    <div class="viewer-foot">
      <button type="button" class="viewer-button" data-viewer="previous" aria-label="Previous screenshot">←</button>
      <p class="viewer-caption"></p>
      <button type="button" class="viewer-button" data-viewer="next" aria-label="Next screenshot">→</button>
    </div>`;
  document.body.append(dialog);
  return dialog;
}

/** Wire the viewer for thumbnails rendered inside `root`. */
export function initAlbum(root) {
  const dialog = viewerDialog();
  const image = dialog.querySelector(".viewer-image");
  let current = 0;
  let opener = null;
  let swipeStart = null;

  function show(index) {
    current = (index + order.length) % order.length;
    const shot = order[current];
    image.src = `assets/album/${shot.file}.jpg`;
    image.alt = altText(shot);
    dialog.querySelector(".viewer-caption").textContent = shot.caption;
    dialog.querySelector(".viewer-count").textContent = `${current + 1} of ${order.length}`;
  }

  root.addEventListener("click", (event) => {
    const thumb = event.target.closest("[data-shot]");
    if (!thumb) return;
    opener = thumb;
    show(Number(thumb.dataset.shot));
    dialog.showModal();
  });

  dialog.addEventListener("click", (event) => {
    const action = event.target.closest("[data-viewer]")?.dataset.viewer;
    if (action === "close" || event.target === dialog) dialog.close();
    else if (action === "previous") show(current - 1);
    else if (action === "next") show(current + 1);
  });

  dialog.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") show(current - 1);
    else if (event.key === "ArrowRight") show(current + 1);
  });

  image.addEventListener("pointerdown", (event) => {
    swipeStart = event.clientX;
  });
  image.addEventListener("pointerup", (event) => {
    if (swipeStart === null) return;
    const moved = event.clientX - swipeStart;
    swipeStart = null;
    if (Math.abs(moved) >= SWIPE_MIN_PX) show(current + (moved < 0 ? 1 : -1));
  });

  dialog.addEventListener("close", () => opener?.focus({ preventScroll: true }));
}

/** Render the album into `view`, loading data/album.json the first time it's shown. */
export async function renderAlbum(view) {
  if (!shots) {
    view.innerHTML = `<p class="status">Loading the album…</p>`;
    try {
      const response = await fetch("data/album.json");
      if (!response.ok) throw new Error(`data/album.json returned ${response.status}`);
      shots = (await response.json()).shots;
    } catch (error) {
      view.innerHTML = `<p class="status status-error">The album didn't load. Reload the page to try again.</p>`;
      throw error; // keeps the technical detail in the browser console
    }
    // Someone may have switched views while the album loaded.
    if (viewFromHash(location.hash) !== "album") return;
  }
  order = groupByDay(shots).flatMap((session) => session.shots);
  view.innerHTML = albumHtml(shots);
}
