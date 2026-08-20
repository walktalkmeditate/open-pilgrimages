(function () {
  var table = document.querySelector("[data-sortable]");
  if (!table || !table.tHead) return;

  var tbody = table.tBodies[0];
  var headerRow = table.tHead.rows[0];
  var buttons = [].slice.call(headerRow.querySelectorAll("button[data-sort]"));

  function sortRows(columnIndex, direction) {
    var rows = [].slice.call(tbody.rows);
    var sign = direction === "ascending" ? 1 : -1;

    rows.sort(function (a, b) {
      var av = parseFloat(a.cells[columnIndex].getAttribute("data-value"));
      var bv = parseFloat(b.cells[columnIndex].getAttribute("data-value"));
      var aMissing = isNaN(av);
      var bMissing = isNaN(bv);

      // Missing/malformed data-value always sorts last, regardless of
      // direction — otherwise NaN propagates into the comparator's result,
      // which Array#sort treats as "equal" and leaves in an arbitrary order.
      if (aMissing || bMissing) return aMissing && bMissing ? 0 : aMissing ? 1 : -1;

      return (av - bv) * sign;
    });

    rows.forEach(function (row) {
      tbody.appendChild(row);
    });
  }

  buttons.forEach(function (button) {
    button.addEventListener("click", function () {
      var th = button.parentElement;
      var columnIndex = th.cellIndex;
      var direction = th.getAttribute("aria-sort") === "descending" ? "ascending" : "descending";

      buttons.forEach(function (otherButton) {
        otherButton.parentElement.setAttribute("aria-sort", otherButton === button ? direction : "none");
      });

      sortRows(columnIndex, direction);
    });
  });
})();
