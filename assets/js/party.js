// The Party view: the roster of characters, and each filled-in character's profile with its tabs.
//
// Routes: #party (roster), #party/gear (everyone's gear by act), #party/<profile> (last tab used),
// #party/<profile>/<tab>.

import { renderGearTab } from "./gearplan.js";
import { renderIllithidTab, renderPlaybookTab } from "./guides.js";
import { esc } from "./html.js";
import { MAX_LEVEL, renderLevelTab } from "./levelup.js";
import { PARTY_GEAR_ROUTE, renderPartyGear } from "./partygear.js";
import { renderPicksPage } from "./picks.js";
import { PROFILE_TABS, loadProgress, saveProgress, toggleInList } from "./progress.js";

const TAB_LABELS = { level: "Level up", gear: "Gear plan", illithid: "Illithid", playbook: "Playbook", backstory: "Backstory" };

/** A portrait, or an empty frame for a friend who hasn't sent one yet. */
const portrait = (profile, className, width, height, alt) =>
  profile.portrait
    ? `<img class="${className}" src="${esc(profile.portrait)}" alt="${esc(alt)}" width="${width}" height="${height}" />`
    : `<div class="${className} member-portrait-empty" aria-hidden="true"></div>`;

/** Split "#party/vesper/gear" into its parts; unknown tabs are dropped so the saved tab is used. */
export function parsePartyRoute(hash) {
  const [view, profileId, tab] = hash.replace(/^#/, "").split("/");
  if (view !== "party") return null;
  return { profileId: profileId || null, tab: PROFILE_TABS.includes(tab) ? tab : null };
}

const progressById = new Map();
const viewingById = new Map();
let hideGot = false;
let loadoutAct = null;

function progressFor(profileId) {
  if (!progressById.has(profileId)) progressById.set(profileId, loadProgress(profileId));
  return progressById.get(profileId);
}

function updateProgress(profileId, next) {
  progressById.set(profileId, next);
  saveProgress(profileId, next);
}

const viewingFor = (profileId) => viewingById.get(profileId) ?? Math.min(progressFor(profileId).level + 1, MAX_LEVEL);

/** A card for each party member, linking to their profile; Home and the Party tab both show it. */
export function rosterCards(data) {
  const cards = data.party.members
    .map((member) => {
      const profile = member.profile ? data.party.profiles.get(member.profile) : null;
      if (!profile) {
        return `
          <li class="member member-empty">
            <div class="member-portrait member-portrait-empty" aria-hidden="true"></div>
            <div>
              <h2 class="member-name">${esc(member.name)}</h2>
              <p class="muted">${esc(member.role)}</p>
              <p class="small muted">Profile not written yet.</p>
            </div>
          </li>`;
      }
      return `
        <li class="member">
          ${portrait(profile, "member-portrait", 96, 114, "")}
          <div>
            <h2 class="member-name"><a href="#party/${esc(profile.id)}">${esc(profile.name)}</a></h2>
            <p class="member-title">${esc(profile.title)}</p>
            <p class="muted">${esc(profile.classes)}</p>
          </div>
        </li>`;
    })
    .join("");
  return `<ul class="roster">${cards}</ul>`;
}

function renderRoster(data) {
  const overview = `
    <a class="party-gear-card" href="#party/${PARTY_GEAR_ROUTE}">
      <span class="party-gear-card-title">Party gear by act</span>
      <span class="muted">Every character's picks for each slot, side by side, one act at a time.</span>
    </a>`;
  return `${overview}${rosterCards(data)}`;
}

/**
 * The Backstory tab, set like a page from a storybook: the full painting beside the story, a drop cap,
 * and the last paragraph (where the game picks up) set apart under an ornament.
 */
export function backstory(profile) {
  const paragraphs = profile.bio.map((paragraph) => `<p>${esc(paragraph)}</p>`);
  if (paragraphs.length > 1) {
    const last = paragraphs.pop().replace("<p>", '<p class="bio-now">');
    paragraphs.push(`<p class="bio-ornament" aria-hidden="true">◆ ◆ ◆</p>`, last);
  }
  const painting = profile.portrait_full
    ? `<figure class="bio-painting">${fullPortraitLink(
        profile,
        `<img src="${esc(profile.portrait_full)}" alt="Portrait of ${esc(profile.name)}" decoding="async" />`,
      )}</figure>`
    : "";
  return `<article class="profile-bio${painting ? " has-painting" : ""}">${painting}<div class="bio-text">${paragraphs.join("")}</div></article>`;
}

/** The tabs this profile has: Backstory only when the profile has a bio. */
export const profileTabs = (profile) => PROFILE_TABS.filter((t) => t !== "backstory" || profile.bio?.length);

/** The profile portrait as a button that opens the full-size painting, when the profile has one. */
export function fullPortraitLink(profile, img) {
  if (!profile.portrait_full) return img;
  return `<button type="button" class="portrait-zoom" data-full-image="${esc(profile.portrait_full)}" data-caption="${esc(profile.name)}" aria-label="View ${esc(profile.name)}'s portrait full size">${img}</button>`;
}

function profileHeader(profile) {
  const facts = [
    ["Race", profile.race],
    ["Background", profile.background],
    ["Difficulty", profile.difficulty],
  ]
    .filter(([, value]) => value)
    .map(([label, value]) => `<div><dt>${label}</dt><dd>${esc(value)}</dd></div>`);
  return `
    <a class="back-link" href="#party">All party members</a>
    <header class="profile-head">
      ${fullPortraitLink(profile, portrait(profile, "profile-portrait", 160, 190, `Portrait of ${profile.name}`))}
      <div>
        <h2 class="profile-name">${esc(profile.name)}</h2>
        <p class="profile-title">${esc(profile.title)}</p>
        <p class="profile-classes">${esc(profile.classes)}</p>
        ${facts.length ? `<dl class="profile-facts">${facts.join("")}</dl>` : ""}
        <p class="profile-role">${esc(profile.role)}</p>
      </div>
    </header>`;
}

function tabNav(profile, tab) {
  const links = profileTabs(profile).map(
    (t) => `<a href="#party/${esc(profile.id)}/${t}"${t === tab ? ' aria-current="page"' : ""}>${TAB_LABELS[t]}</a>`,
  ).join("");
  return `<nav class="profile-tabs" aria-label="${esc(profile.name)}'s profile">${links}</nav>`;
}

function tabBody(profile, data, tab) {
  const progress = progressFor(profile.id);
  if (tab === "gear") return renderGearTab(profile, data, progress, hideGot, loadoutAct);
  if (tab === "illithid") return renderIllithidTab(profile, data.abilities, progress);
  if (tab === "playbook") return renderPlaybookTab(profile);
  if (tab === "backstory") return backstory(profile);
  return renderLevelTab(profile, data.abilities, progress.level, viewingFor(profile.id));
}

export function renderParty(view, data, route) {
  if (route.profileId === PARTY_GEAR_ROUTE) {
    view.innerHTML = renderPartyGear(data, loadoutAct);
    return;
  }
  const profile = route.profileId ? data.party.profiles.get(route.profileId) : null;
  if (!profile) {
    view.innerHTML = `
      ${route.profileId ? `<p class="status status-error">There's no profile called “${esc(route.profileId)}”. Pick a party member below.</p>` : ""}
      ${renderRoster(data)}`;
    return;
  }
  // A friend's profile is one page of good picks; only a full build plan has tabs and tracked progress.
  if (profile.style === "options") {
    view.innerHTML = `
      <article class="profile" data-profile="${esc(profile.id)}">
        ${profileHeader(profile)}
        <div class="profile-body">${renderPicksPage(profile, data, loadoutAct)}</div>
      </article>`;
    return;
  }
  const progress = progressFor(profile.id);
  // A Backstory link for a character with no bio opens Level up instead.
  const asked = route.tab ?? progress.tab;
  const tab = profileTabs(profile).includes(asked) ? asked : "level";
  if (tab !== progress.tab) updateProgress(profile.id, { ...progress, tab });
  view.innerHTML = `
    <article class="profile" data-profile="${esc(profile.id)}">
      ${profileHeader(profile)}
      ${tabNav(profile, tab)}
      <div class="profile-body">${tabBody(profile, data, tab)}</div>
    </article>`;
}

/** Wire the profile controls. `rerender` redraws the current view; focus is restored afterwards. */
export function initParty(view, rerender) {
  const profileId = () => view.querySelector("[data-profile]")?.dataset.profile;

  const showLevel = (level) => {
    viewingById.set(profileId(), Math.min(Math.max(level, 1), MAX_LEVEL));
    rerender();
    view.querySelector("#level-heading")?.focus();
  };

  const setReached = (level) => {
    const id = profileId();
    updateProgress(id, { ...progressFor(id), level });
    viewingById.set(id, Math.min(level + 1, MAX_LEVEL));
  };

  view.addEventListener("click", (event) => {
    // The playbook's jump bar scrolls within the page; a hash link would change the view instead.
    const jump = event.target.closest("[data-jump]");
    if (jump) {
      const heading = document.getElementById(jump.dataset.jump);
      heading.scrollIntoView({ block: "start" });
      heading.focus({ preventScroll: true });
      return;
    }
    const step = event.target.closest("[data-level-view]");
    if (step) return showLevel(Number(step.dataset.levelView));
    const act = event.target.closest("[data-loadout-act]");
    if (act) {
      loadoutAct = act.dataset.loadoutAct;
      rerender();
      return view.querySelector(`[data-loadout-act="${CSS.escape(loadoutAct)}"]`)?.focus({ preventScroll: true });
    }
    const reached = event.target.closest("[data-level-reached]");
    if (reached) {
      setReached(Number(reached.dataset.levelReached));
      rerender();
      view.querySelector("#level-heading")?.focus();
    }
  });

  view.addEventListener("change", (event) => {
    const { target } = event;
    if (target.matches("[data-level-select]")) {
      setReached(Number(target.value));
      rerender();
      return view.querySelector("[data-level-select]")?.focus();
    }
    if (target.matches("[data-hide-got]")) {
      hideGot = target.checked;
      rerender();
      return view.querySelector("[data-hide-got]")?.focus();
    }
    if (target.matches("[data-progress]")) {
      const id = profileId();
      const { progress: list } = target.dataset;
      updateProgress(id, toggleInList(progressFor(id), list, target.value, target.checked));
      rerender();
      const again = view.querySelector(`[data-progress="${list}"][value="${CSS.escape(target.value)}"]`);
      (again ?? view.querySelector(".plan-count"))?.focus({ preventScroll: true });
    }
  });
}
