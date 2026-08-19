(function () {
  var root = document.querySelector("[data-constellation]");
  if (!root || !window.OP_GLYPHS) return;

  var inks = [].slice.call(root.querySelectorAll(".glyph-ink"));
  var caps = [].slice.call(root.querySelectorAll(".constellation-caption"));
  if (inks.length === 0) return;

  // Reduce Motion: render one route inked and start no loop whatsoever.
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    inks[0].style.strokeDashoffset = 0;
    if (caps[0]) caps[0].style.opacity = 1;
    return;
  }

  var DRAW = 2600, HOLD = 1700, EXIT = 900, LAP = DRAW + HOLD + EXIT;
  var index = 0, elapsed = 0, last = 0, paused = false;
  var prevInked = -1, captioned = -1;

  function caption(n) {
    if (captioned === n) return;
    if (captioned !== -1 && caps[captioned]) caps[captioned].style.opacity = 0;
    if (n !== -1 && caps[n]) caps[n].style.opacity = 1;
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
      index = (index + 1) % inks.length;
    }

    var p = elapsed < DRAW ? 1 - elapsed / DRAW
          : elapsed < DRAW + HOLD ? 0
          : -(elapsed - DRAW - HOLD) / EXIT;

    // CSS already rests every .glyph-ink at stroke-dashoffset: 1, so an
    // element only needs a write once it becomes active, and its previous
    // owner only needs one write back to that resting value when it hands off.
    if (prevInked !== index) {
      if (prevInked !== -1) inks[prevInked].style.strokeDashoffset = 1;
      prevInked = index;
    }
    inks[index].style.strokeDashoffset = p;

    caption(elapsed > DRAW * 0.55 && elapsed < LAP - EXIT * 0.6 ? index : -1);
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

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    if (button) button.setAttribute("aria-pressed", String(theme === "dark"));
  }

  var stored = null;
  try { stored = localStorage.getItem(KEY); } catch (e) { /* private mode */ }
  var systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(stored || (systemDark ? "dark" : "light"));

  if (!button) return;

  button.addEventListener("click", function () {
    var current = document.documentElement.getAttribute("data-theme");
    var next = current === "dark" ? "light" : "dark";
    applyTheme(next);
    try { localStorage.setItem(KEY, next); } catch (e) { /* ignore */ }
  });
})();
