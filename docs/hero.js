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
  var index = 0, elapsed = 0, last = 0, paused = false, captioned = -1;

  function caption(n) {
    if (captioned === n) return;
    captioned = n;
    for (var k = 0; k < caps.length; k++) caps[k].style.opacity = k === n ? 1 : 0;
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

    for (var i = 0; i < inks.length; i++) {
      inks[i].style.strokeDashoffset = i === index ? p : 1;
    }
    caption(elapsed > DRAW * 0.55 && elapsed < LAP - EXIT * 0.6 ? index : -1);
  }
  requestAnimationFrame(frame);

  function pause() { paused = true; }
  function resume() { paused = false; }
  root.addEventListener("pointerenter", pause);
  root.addEventListener("pointerleave", resume);
  root.addEventListener("focusin", pause);
  root.addEventListener("focusout", resume);
})();

(function () {
  var KEY = "op-theme";
  var stored = null;
  try { stored = localStorage.getItem(KEY); } catch (e) { /* private mode */ }
  if (stored) document.documentElement.setAttribute("data-theme", stored);

  var button = document.querySelector(".theme-toggle");
  if (!button) return;

  button.addEventListener("click", function () {
    var dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    var current = document.documentElement.getAttribute("data-theme") || (dark ? "dark" : "light");
    var next = current === "dark" ? "light" : "dark";

    document.documentElement.setAttribute("data-theme", next);
    button.setAttribute("aria-pressed", String(next === "dark"));
    try { localStorage.setItem(KEY, next); } catch (e) { /* ignore */ }
  });
})();
