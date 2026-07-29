(() => {
  let currentSnapshot = null;

  const formatNumber = value => Number(value || 0).toLocaleString("en-US");
  const text = value => String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);

  const compareNumeric = key => (a, b) => Number(b[key] || 0) - Number(a[key] || 0);
  const reverseRows = rows => Array.isArray(rows) ? [...rows].reverse() : [];

  const setActiveTab = button => {
    const group = button.closest(".analytics-panel-tabs");
    if (!group) return;

    group.querySelectorAll("button").forEach(item => item.classList.toggle("active", item === button));
  };

  const renderSummary = summary => {
    const host = document.querySelector("[data-plum-summary]");
    if (!host || !Array.isArray(summary)) return;

    host.innerHTML = summary.map(item => `
      <article>
        <span>${text(item.label)}</span>
        <strong>${text(item.value)}</strong>
        <em>${text(item.trend)}</em>
      </article>
    `).join("");
  };

  const renderTable = (name, rows, columns) => {
    const table = document.querySelector(`[data-plum-table="${name}"]`);
    if (!table || !Array.isArray(rows)) return;
    const body = table.querySelector("tbody");
    if (!body) return;

    body.innerHTML = rows.map(row => `
      <tr>
        <td>${text(row[columns[0]])}</td>
        <td>${formatNumber(row[columns[1]])}</td>
      </tr>
    `).join("");
  };

  const renderLive = rows => {
    const host = document.querySelector("[data-plum-live]");
    if (!host || !Array.isArray(rows)) return;

    host.innerHTML = rows.map(row => `
      <li><strong>${text(row.label)}</strong><span>${text(row.page)}</span><em>${text(row.when)}</em></li>
    `).join("");
  };

  const renderDeviceBars = rows => {
    const host = document.querySelector("[data-plum-devices]");
    if (!host || !Array.isArray(rows)) return;

    host.innerHTML = rows.map(row => {
      const value = Math.max(0, Math.min(100, Number(row.value) || 0));
      return `<div><span>${text(row.label)}</span><span class="analytics-meter" aria-label="${value}%"><span style="width:${value}%"></span></span><em>${value}%</em></div>`;
    }).join("");
  };

  const renderCityRollup = rows => {
    const cityCounts = new Map();
    (rows || []).forEach(row => {
      const label = row.label || "(not set)";
      const current = cityCounts.get(label) || { label, count: 0, page: row.page || "Active visitor" };
      current.count += Number(row.count || 1);
      cityCounts.set(label, current);
    });

    renderLive([...cityCounts.values()]
      .sort(compareNumeric("count"))
      .map(row => ({ label: row.label, page: row.page, when: `${row.count} active` })));
  };

  const chartPoint = (index, value, maxValue, count) => {
    const x = count <= 1 ? 0 : (760 / (count - 1)) * index;
    const y = 244 - (Number(value || 0) / maxValue) * 220;
    return [Number(x.toFixed(2)), Number(Math.max(16, Math.min(244, y)).toFixed(2))];
  };

  const renderVisits = visits => {
    if (!visits?.total?.length) return;
    const total = visits.total.map(Number);
    const unique = (visits.unique || []).map(Number);
    const labels = visits.labels || [];
    const maxValue = Math.max(1, ...total, ...unique);
    const totalPoints = total.map((value, index) => chartPoint(index, value, maxValue, total.length));
    const uniquePoints = unique.map((value, index) => chartPoint(index, value, maxValue, unique.length));
    const totalPath = totalPoints.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x} ${y}`).join(" ");
    const uniquePath = uniquePoints.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x} ${y}`).join(" ");
    const areaPath = `${totalPath} L760 260 L0 260 Z`;

    document.querySelector(".analytics-area")?.setAttribute("d", areaPath);
    document.querySelector(".analytics-line--total")?.setAttribute("d", totalPath);
    document.querySelector(".analytics-line--unique")?.setAttribute("d", uniquePath);

    const points = document.querySelector(".analytics-points");
    if (points) {
      points.innerHTML = totalPoints.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5" />`).join("");
    }

    const axis = document.querySelector(".analytics-x-axis");
    if (axis && labels.length) {
      axis.innerHTML = labels.map(label => `<span>${text(label)}</span>`).join("");
      axis.style.gridTemplateColumns = `repeat(${labels.length}, 1fr)`;
    }
  };

  const renderPanelView = (tabName, view) => {
    if (!currentSnapshot) return;

    if (tabName === "visits") {
      renderVisits(currentSnapshot.visits);
      return;
    }

    if (tabName === "referrers") {
      const rows = view === "repeat"
        ? [...(currentSnapshot.referrers || [])].sort(compareNumeric("hits"))
        : currentSnapshot.referrers;
      renderTable("referrers", rows, ["source", "hits"]);
      return;
    }

    if (tabName === "pages") {
      const rows = view === "recent" ? reverseRows(currentSnapshot.pages) : currentSnapshot.pages;
      renderTable("pages", rows, ["page", "views"]);
      return;
    }

    if (tabName === "live") {
      if (view === "city") renderCityRollup(currentSnapshot.live);
      else renderLive(currentSnapshot.live);
      return;
    }

    if (tabName === "searches") {
      const rows = view === "recent" ? reverseRows(currentSnapshot.searches) : currentSnapshot.searches;
      renderTable("searches", rows, ["query", "hits"]);
      return;
    }

    if (tabName === "devices") {
      if (view === "platform") renderDeviceBars(currentSnapshot.platforms || currentSnapshot.devices);
      else renderDeviceBars(currentSnapshot.screens || currentSnapshot.devices);
    }
  };

  document.addEventListener("click", event => {
    const button = event.target.closest("[data-plum-tab]");
    if (!button) return;

    setActiveTab(button);
    renderPanelView(button.dataset.plumTab, button.dataset.plumView);
  });

  fetch("/data/plum.json", { cache: "no-store" })
    .then(response => response.ok ? response.json() : Promise.reject(new Error("Snapshot unavailable")))
    .then(snapshot => {
      currentSnapshot = snapshot;
      renderSummary(snapshot.summary);
      renderVisits(snapshot.visits);
      renderTable("referrers", snapshot.referrers, ["source", "hits"]);
      renderTable("pages", snapshot.pages, ["page", "views"]);
      renderTable("searches", snapshot.searches, ["query", "hits"]);
      renderLive(snapshot.live);
      renderDeviceBars(snapshot.screens || snapshot.devices);
    })
    .catch(() => {});
})();
