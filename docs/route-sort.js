(function () {
  var table = document.querySelector("[data-sortable]");
  if (!table) return;

  var tbody = table.tBodies[0];
  var headerRow = table.tHead.rows[0];
  var buttons = [].slice.call(headerRow.querySelectorAll("button[data-sort]"));

  function sortRows(columnIndex, direction) {
    var rows = [].slice.call(tbody.rows);
    var sign = direction === "ascending" ? 1 : -1;

    rows.sort(function (a, b) {
      var av = parseFloat(a.cells[columnIndex].getAttribute("data-value"));
      var bv = parseFloat(b.cells[columnIndex].getAttribute("data-value"));
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

      [].slice.call(headerRow.cells).forEach(function (cell) {
        cell.setAttribute("aria-sort", cell === th ? direction : "none");
      });

      sortRows(columnIndex, direction);
    });
  });
})();
