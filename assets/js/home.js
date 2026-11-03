// Home: the first page of the party section. The newest session's screenshots, then the party roster.

import { dayLabel, groupByDay, renderWithAlbum, shotCard, viewerOrder } from "./album.js";
import { esc } from "./html.js";
import { rosterCards } from "./party.js";

const LATEST_SHOTS = 4;

/** The party's name, or a marked placeholder until the party picks one. */
export function partyNameHtml(name) {
  return name
    ? esc(name)
    : `<span class="party-name-placeholder">Party name</span> <span class="placeholder-tag">to come</span>`;
}

/** The browser tab's title. */
export function pageTitle(name) {
  return name ? `${name}: Baldur's Gate 3` : "Our Baldur's Gate 3 party";
}

/** The last few shots of the newest session, in the order they were taken. */
export function latestSession(shots) {
  const [newest] = groupByDay(shots);
  return newest ? { day: newest.day, shots: newest.shots.slice(-LATEST_SHOTS) } : null;
}

export function homeHtml(shots, data) {
  const latest = latestSession(shots);
  const order = viewerOrder(shots);
  const session = latest
    ? `
      <h2 class="home-title">Last session: ${esc(dayLabel(latest.day))}</h2>
      <ul class="album-grid home-shots">${latest.shots.map((shot) => shotCard(shot, order.indexOf(shot))).join("")}</ul>
      <a class="home-more" href="#album">See the whole album</a>`
    : `<h2 class="home-title">Album</h2><p class="muted">No screenshots yet.</p>`;
  return `
    <div class="home">
      <section class="home-session" aria-label="Last session">${session}</section>
      <section class="home-party" aria-label="The party">
        <h2 class="home-title">The party</h2>
        ${rosterCards(data)}
      </section>
    </div>`;
}

/** Render Home into `view`. */
export function renderHome(view, data) {
  return renderWithAlbum(view, "home", (shots) => homeHtml(shots, data));
}
