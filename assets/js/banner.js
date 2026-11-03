// Home's banner: album shots marked "banner" fade from one to the next behind the party name.
//
// A new shot shows every few seconds. Pause stops it, and pointing at or tabbing into the banner holds the
// current shot. With reduced motion the banner shows one shot and never changes.

import { viewerOrder } from "./album.js";

const ROTATE_MS = 7000;

/** The shots the banner rotates through, newest session first: those marked "banner", or every shot if none are. */
export function bannerShots(shots) {
  const picked = shots.filter((shot) => shot.banner);
  return viewerOrder(picked.length ? picked : shots);
}

/** Start the banner in `hero` (the page's .hero header) with the album's shots. */
export function initBanner(hero, shots) {
  const picks = bannerShots(shots);
  const layers = [...hero.querySelectorAll(".hero-image")];
  const caption = hero.querySelector(".hero-caption");
  const pause = hero.querySelector(".hero-pause");
  if (!picks.length) return;

  let index = 0;
  let paused = false;
  let held = false;

  // The images are decorative (alt=""): the caption beside them says what each shot is.
  const show = (layer, shot) => {
    layer.src = `assets/album/${shot.file}.jpg`;
  };
  show(layers[0], picks[0]);
  layers[0].classList.add("is-shown");
  caption.textContent = picks[0].caption;

  if (picks.length < 2 || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  pause.hidden = false;

  function advance() {
    if (paused || held || hero.hidden || document.hidden) return;
    index = (index + 1) % picks.length;
    const [shown, next] = layers[0].classList.contains("is-shown") ? layers : [...layers].reverse();
    // Swap only once the next shot has loaded, so a slow connection never fades to an empty frame.
    next.onload = () => {
      next.classList.add("is-shown");
      shown.classList.remove("is-shown");
      caption.textContent = picks[index].caption;
    };
    show(next, picks[index]);
  }

  setInterval(advance, ROTATE_MS);
  pause.addEventListener("click", () => {
    paused = !paused;
    pause.textContent = paused ? "Play" : "Pause";
    pause.setAttribute("aria-pressed", String(paused));
  });
  hero.addEventListener("pointerenter", () => (held = true));
  hero.addEventListener("pointerleave", () => (held = false));
  hero.addEventListener("focusin", () => (held = true));
  hero.addEventListener("focusout", () => (held = false));
}
