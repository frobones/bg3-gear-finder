// The Party view: the roster of characters, and each filled-in character's profile with its tabs.
//
// Routes: #party (roster), #party/<profile> (last tab used), #party/<profile>/<tab>.

import { renderGearTab } from "./gearplan.js";
import { renderIllithidTab, renderPlaybookTab, renderScrollsTab } from "./guides.js";
import { esc } from "./html.js";
import { MAX_LEVEL, renderLevelTab } from "./levelup.js";
import { renderPicksPage } from "./picks.js";
import { PROFILE_TABS, loadProgress, saveProgress, toggleInList } from "./progress.js";

const TAB_LABELS = { level: "Level up", gear: "Gear plan", scrolls: "Scrolls", illithid: "Illithid", playbook: "Playbook" };

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

function levelLabel(level) {
  return level === 0 ? "Not created yet" : `Level ${level} of ${MAX_LEVEL}`;
}

function renderRoster(data) {
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
            <p class="small">${levelLabel(progressFor(profile.id).level)}</p>
          </div>
        </li>`;
    })
    .join("");
  return `<ul class="roster">${cards}</ul>`;
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
      ${portrait(profile, "profile-portrait", 160, 190, `Portrait of ${profile.name}`)}
      <div>
        <h2 class="profile-name">${esc(profile.name)}</h2>
        <p class="profile-title">${esc(profile.title)}</p>
        <p class="profile-classes">${esc(profile.classes)}</p>
        ${facts.length ? `<dl class="profile-facts">${facts.join("")}</dl>` : ""}
        <p class="profile-role">${esc(profile.role)}</p>
      </div>
      ${
        profile.arc
          ? `<blockquote class="profile-arc">
        <p><span class="muted">Before the Nautiloid:</span> “${esc(profile.arc.before)}”</p>
        <p><span class="muted">After:</span> “${esc(profile.arc.after)}”</p>
      </blockquote>`
          : ""
      }
    </header>`;
}

function tabNav(profile, tab) {
  const links = PROFILE_TABS.map(
    (t) => `<a href="#party/${esc(profile.id)}/${t}"${t === tab ? ' aria-current="page"' : ""}>${TAB_LABELS[t]}</a>`,
  ).join("");
  return `<nav class="profile-tabs" aria-label="${esc(profile.name)}'s profile">${links}</nav>`;
}

function tabBody(profile, data, tab) {
  const progress = progressFor(profile.id);
  if (tab === "gear") return renderGearTab(profile, data, progress, hideGot, loadoutAct);
  if (tab === "scrolls") return renderScrollsTab(profile, data.abilities, progress);
  if (tab === "illithid") return renderIllithidTab(profile, data.abilities, progress);
  if (tab === "playbook") return renderPlaybookTab(profile);
  return renderLevelTab(profile, data.abilities, progress.level, viewingFor(profile.id));
}

export function renderParty(view, data, route) {
  const profile = route.profileId ? data.party.profiles.get(route.profileId) : null;
  if (!profile) {
    view.innerHTML = `
      ${route.profileId ? `<p class="status status-error">There's no profile called “${esc(route.profileId)}”. Pick a party member below.</p>` : ""}
      ${renderRoster(data)}`;
    return;
  }
  const progress = progressFor(profile.id);
  // A friend's profile is one page of good picks; only a full build plan has tabs.
  if (profile.style === "options") {
    view.innerHTML = `
      <article class="profile" data-profile="${esc(profile.id)}">
        ${profileHeader(profile)}
        <div class="profile-body">${renderPicksPage(profile, data, progress, { hideGot, loadoutAct })}</div>
      </article>`;
    return;
  }
  const tab = route.tab ?? progress.tab;
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
