(function () {
  "use strict";

  var panel = document.querySelector("[data-route-filter]");
  var grid = document.querySelector(".route-grid");
  if (!panel || !grid) return;

  var cards = [].slice.call(grid.querySelectorAll(".route-card[data-days]"));
  if (cards.length === 0) return;

  var daysInput = document.getElementById("filter-days");
  var distanceInput = document.getElementById("filter-distance");
  var difficultySelect = document.getElementById("filter-difficulty");
  var monthSelect = document.getElementById("filter-month");
  var clearButton = document.getElementById("filter-clear");
  var status = document.getElementById("filter-status");
  var resetLink = document.getElementById("filter-reset-link");

  // Every control the panel depends on must exist before it's safe to reveal
  // — a half-wired panel would be exactly the "filter UI that does nothing"
  // progressive enhancement forbids.
  if (!daysInput || !distanceInput || !difficultySelect || !monthSelect || !clearButton || !status || !resetLink) {
    return;
  }

  var total = cards.length;

  function cardMatches(card) {
    var days = Number(card.getAttribute("data-days"));
    var distanceKm = Number(card.getAttribute("data-distance-km"));
    var difficulty = card.getAttribute("data-difficulty") || "";
    var monthsAttr = card.getAttribute("data-best-months") || "";
    // A route with no bestMonths in metadata.json (it's optional in the
    // schema) renders data-best-months="". "".split(",") would yield [""],
    // which then matches no month at all — an unconstrained route would be
    // hidden under every month selection instead of shown for all of them.
    var months = monthsAttr === "" ? [] : monthsAttr.split(",");

    var maxDays = daysInput.value;
    if (maxDays !== "" && !(days <= Number(maxDays))) return false;

    var maxDistance = distanceInput.value;
    if (maxDistance !== "" && !(distanceKm <= Number(maxDistance))) return false;

    var wantDifficulty = difficultySelect.value;
    if (wantDifficulty !== "" && difficulty !== wantDifficulty) return false;

    var wantMonth = monthSelect.value;
    if (wantMonth !== "" && months.length > 0 && months.indexOf(wantMonth) === -1) return false;

    return true;
  }

  function resetFilters() {
    daysInput.value = "";
    distanceInput.value = "";
    difficultySelect.value = "";
    monthSelect.value = "";
    applyFilters();
    clearButton.focus();
  }

  // The "way back" on a zero-match result lives outside the live region
  // (see routes.html) — ARIA guidance discourages focusable content inside
  // role="status", and a button announced mid-region reads awkwardly to
  // screen readers anyway. It's shown/hidden in lockstep with the message
  // instead.
  var lastMessage = null;

  function renderStatus(visible) {
    var message =
      visible === 0
        ? "No routes match these filters."
        : visible === total
          ? "Showing all " + total + " routes."
          : visible + " of " + total + " routes match.";

    // Only touch the live region when its text actually changes — some
    // screen readers re-announce role="status" on every DOM write, even one
    // that leaves the rendered text identical, which turns every keystroke
    // in the days/distance fields into a redundant announcement.
    if (message !== lastMessage) {
      status.textContent = message;
      lastMessage = message;
    }

    resetLink.hidden = visible !== 0;
  }

  function applyFilters() {
    var visible = 0;
    cards.forEach(function (card) {
      var match = cardMatches(card);
      card.hidden = !match;
      if (match) visible += 1;
    });
    renderStatus(visible);
  }

  [daysInput, distanceInput].forEach(function (input) {
    input.addEventListener("input", applyFilters);
  });
  [difficultySelect, monthSelect].forEach(function (select) {
    select.addEventListener("change", applyFilters);
  });
  clearButton.addEventListener("click", resetFilters);
  resetLink.addEventListener("click", resetFilters);

  applyFilters();
})();
