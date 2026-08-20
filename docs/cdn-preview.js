(function () {
  var INDEX_URL = "https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v1/index.json";
  var TIMEOUT_MS = 6000;

  document.addEventListener("DOMContentLoaded", function () {
    var status = document.getElementById("cdn-preview-status");
    var output = document.getElementById("cdn-preview-output");
    if (!status || !output) return;

    status.textContent = "Fetching index.json from jsDelivr…";

    var controller = typeof AbortController === "function" ? new AbortController() : null;
    var timer = controller
      ? setTimeout(function () { controller.abort(); }, TIMEOUT_MS)
      : null;

    fetch(INDEX_URL, controller ? { signal: controller.signal } : {})
      .then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      })
      .then(function (data) {
        output.textContent = JSON.stringify(data, null, 2);
        status.textContent = "Live response from jsDelivr, fetched just now:";
      })
      .catch(function () {
        status.textContent =
          "Live fetch didn't come through (offline, blocked, or jsDelivr unreachable) — showing a static example instead:";
      })
      .finally(function () {
        if (timer) clearTimeout(timer);
      });
  });
})();
