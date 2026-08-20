(function () {
  var root = document.querySelector("[data-constellation]");
  if (!root) return;

  var inks = [].slice.call(root.querySelectorAll(".glyph-ink"));
  var caps = [].slice.call(root.querySelectorAll(".constellation-caption"));
  if (inks.length === 0) return;

  var featuredInk = root.querySelector(".constellation-featured .glyph-ink");
  var featuredIndex = featuredInk ? inks.indexOf(featuredInk) : 0;

  // Below 700px, CSS hides every glyph but the featured one (see styles.css).
  // Cycling through all seven there would draw six glyphs the caption names
  // but the page never shows, so the index stays pinned to the featured slot
  // for as long as that breakpoint is active.
  var mobile = window.matchMedia("(max-width: 700px)");
  var pinned = mobile.matches;
  function syncPinned() { pinned = mobile.matches; }
  if (mobile.addEventListener) mobile.addEventListener("change", syncPinned);
  else mobile.addListener(syncPinned);

  // Reduce Motion: render one route inked and start no loop whatsoever.
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    var restIndex = pinned ? featuredIndex : 0;
    inks[restIndex].style.strokeDashoffset = 0;
    if (caps[restIndex]) caps[restIndex].classList.add("is-shown");
    return;
  }

  var DRAW = 2600, HOLD = 1700, EXIT = 900, LAP = DRAW + HOLD + EXIT;
  var index = 0, elapsed = 0, last = 0, paused = false;
  var prevInked = -1, captioned = -1;

  function caption(n) {
    if (captioned === n) return;
    if (captioned !== -1 && caps[captioned]) caps[captioned].classList.remove("is-shown");
    if (n !== -1 && caps[n]) caps[n].classList.add("is-shown");
    captioned = n;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (!last) last = now;
    // A backgrounded tab throttles rAF; without clamping, the first frame back
    // would leap the animation forward. Clamped, returning is seamless.
    var dt = Math.min(now - last, 48);
    last = now;
    if (paused) return;

    elapsed += dt;
    while (elapsed >= LAP) {
      elapsed -= LAP;
      if (!pinned) index = (index + 1) % inks.length;
    }

    var active = pinned ? featuredIndex : index;

    var p = elapsed < DRAW ? 1 - elapsed / DRAW
          : elapsed < DRAW + HOLD ? 0
          : -(elapsed - DRAW - HOLD) / EXIT;

    // CSS already rests every .glyph-ink at stroke-dashoffset: 1, so an
    // element only needs a write once it becomes active, and its previous
    // owner only needs one write back to that resting value when it hands off.
    if (prevInked !== active) {
      if (prevInked !== -1) inks[prevInked].style.strokeDashoffset = 1;
      prevInked = active;
    }
    inks[active].style.strokeDashoffset = p;

    caption(elapsed > DRAW * 0.55 && elapsed < LAP - EXIT * 0.6 ? active : -1);
  }
  requestAnimationFrame(frame);

  var hovering = false, focused = false;
  function syncPaused() { paused = hovering || focused; }
  root.addEventListener("pointerenter", function () { hovering = true; syncPaused(); });
  root.addEventListener("pointerleave", function () { hovering = false; syncPaused(); });
  root.addEventListener("focusin", function () { focused = true; syncPaused(); });
  root.addEventListener("focusout", function () { focused = false; syncPaused(); });
})();

(function () {
  var KEY = "op-theme";
  var button = document.querySelector(".theme-toggle");
  var media = window.matchMedia("(prefers-color-scheme: dark)");

  function setPressed(theme) {
    if (button) button.setAttribute("aria-pressed", String(theme === "dark"));
  }

  // Only ever write data-theme for an explicit, stored preference. Otherwise
  // the CSS `prefers-color-scheme` fallback (see styles.css) stays live, so
  // the page keeps tracking OS-level scheme changes instead of freezing at
  // whatever the system reported on load.
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    setPressed(theme);
  }

  var stored = null;
  try { stored = localStorage.getItem(KEY); } catch (e) { /* private mode */ }

  if (stored) {
    applyTheme(stored);
  } else {
    setPressed(media.matches ? "dark" : "light");
  }

  if (!button) return;

  button.addEventListener("click", function () {
    var current = document.documentElement.getAttribute("data-theme") || (media.matches ? "dark" : "light");
    var next = current === "dark" ? "light" : "dark";
    applyTheme(next);
    try { localStorage.setItem(KEY, next); } catch (e) { /* ignore */ }
  });
})();
