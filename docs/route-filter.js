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

  // Every control the panel depends on must exist before it's safe to reveal
  // — a half-wired panel would be exactly the "filter UI that does nothing"
  // progressive enhancement forbids.
  if (!daysInput || !distanceInput || !difficultySelect || !monthSelect || !clearButton || !status) {
    return;
  }

  var total = cards.length;

  function cardMatches(card) {
    var days = parseInt(card.getAttribute("data-days"), 10);
    var distanceKm = parseInt(card.getAttribute("data-distance-km"), 10);
    var difficulty = card.getAttribute("data-difficulty") || "";
    var months = (card.getAttribute("data-best-months") || "").split(",");

    var maxDays = daysInput.value;
    if (maxDays !== "" && !(days <= parseInt(maxDays, 10))) return false;

    var maxDistance = distanceInput.value;
    if (maxDistance !== "" && !(distanceKm <= parseInt(maxDistance, 10))) return false;

    var wantDifficulty = difficultySelect.value;
    if (wantDifficulty !== "" && difficulty !== wantDifficulty) return false;

    var wantMonth = monthSelect.value;
    if (wantMonth !== "" && months.indexOf(wantMonth) === -1) return false;

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

  // The empty-result "way back" lives inside the live region itself, so it
  // is announced along with the zero-match message rather than appearing as
  // a separate, silent element.
  function renderStatus(visible) {
    while (status.firstChild) status.removeChild(status.firstChild);

    if (visible === 0) {
      status.appendChild(document.createTextNode("No routes match these filters. "));
      var resetLink = document.createElement("button");
      resetLink.type = "button";
      resetLink.className = "filter-reset-link";
      resetLink.textContent = "Show all routes";
      resetLink.addEventListener("click", resetFilters);
      status.appendChild(resetLink);
      return;
    }

    var message =
      visible === total ? "Showing all " + total + " routes." : visible + " of " + total + " routes match.";
    status.appendChild(document.createTextNode(message));
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

  applyFilters();
})();
