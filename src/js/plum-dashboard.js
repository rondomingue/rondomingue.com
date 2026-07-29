(() => {
  const formatNumber = value => Number(value || 0).toLocaleString("en-US");
  const text = value => String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);

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

  const renderDevices = rows => {
    const host = document.querySelector("[data-plum-devices]");
    if (!host || !Array.isArray(rows)) return;

    host.innerHTML = rows.map(row => {
      const value = Math.max(0, Math.min(100, Number(row.value) || 0));
      return `<div><span>${text(row.label)}</span><meter min="0" max="100" value="${value}">${value}%</meter><em>${value}%</em></div>`;
    }).join("");
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

  fetch("/data/plum.json", { cache: "no-store" })
    .then(response => response.ok ? response.json() : Promise.reject(new Error("Snapshot unavailable")))
    .then(snapshot => {
      renderSummary(snapshot.summary);
      renderVisits(snapshot.visits);
      renderTable("referrers", snapshot.referrers, ["source", "hits"]);
      renderTable("pages", snapshot.pages, ["page", "views"]);
      renderTable("searches", snapshot.searches, ["query", "hits"]);
      renderLive(snapshot.live);
      renderDevices(snapshot.devices);
    })
    .catch(() => {});
})();
