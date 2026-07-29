(() => {
  let currentSnapshot = null;

  const formatNumber = value => Number(value || 0).toLocaleString("en-US");
  const pieColors = ["#c8289a", "#7a2d74", "#ff77cf", "#5a245e", "#2c7d50", "#79c65a"];
  const visitColors = ["#4b164f", "#7a2d74", "#a2268d", "#c8289a", "#df53b7", "#f08ed2", "#5a245e", "#8f3b93", "#b740a1", "#e36bc4"];
  const rangeLabels = { day: "Past Day", week: "Past Week", month: "Past Month", year: "Past Year" };
  let countryMap = null;
  let countryMarkers = [];
  let mapResizeObserver = null;
  let visitsChart = null;
  let platformChart = null;
  const countryCoordinates = {
    AR: [-64, -34],
    AU: [134, -25],
    BR: [-52, -10],
    CA: [-106, 57],
    CN: [104, 35],
    DE: [10, 51],
    ES: [-4, 40],
    FR: [2, 46],
    GB: [-3, 55],
    IN: [78, 22],
    IT: [12, 43],
    JP: [138, 37],
    MX: [-102, 23],
    NL: [5, 52],
    SE: [15, 62],
    US: [-98, 39]
  };
  const plumMapStyle = {
    version: 8,
    sources: {
      carto: {
        type: "raster",
        tiles: [
          "https://a.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png",
          "https://b.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png",
          "https://c.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png",
          "https://d.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png"
        ],
        tileSize: 256,
        attribution: "&copy; OpenStreetMap contributors &copy; CARTO"
      }
    },
    layers: [
      { id: "carto", type: "raster", source: "carto" }
    ]
  };
  const text = value => String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);

  const compareNumeric = key => (a, b) => Number(b[key] || 0) - Number(a[key] || 0);
  const reverseRows = rows => Array.isArray(rows) ? [...rows].reverse() : [];
  const sumValues = rows => (rows || []).reduce((sum, value) => sum + Number(value || 0), 0);

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

  const renderGenerated = generatedAt => {
    const host = document.querySelector("[data-plum-generated]");
    if (!host || !generatedAt) return;

    const formatted = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    }).format(new Date(generatedAt));
    host.textContent = `Snapshot ${formatted}`;
  };

  const renderTable = (name, rows, columns) => {
    const table = document.querySelector(`[data-plum-table="${name}"]`);
    if (!table || !Array.isArray(rows)) return;
    const body = table.querySelector("tbody");
    if (!body) return;

    body.innerHTML = rows.map(row => `
      <tr>
        <td>${text(row[columns[0]])}</td>
        <td>${formatNumber(row[columns[1]])}${columns[1] === "percent" ? "%" : ""}</td>
      </tr>
    `).join("");
  };

  const flagFromCode = code => {
    const normalized = String(code || "").trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(normalized)) return "•";
    return [...normalized].map(character => String.fromCodePoint(character.charCodeAt(0) + 127397)).join("");
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

    host.className = "analytics-bars";
    host.innerHTML = rows.map(row => {
      const value = Math.max(0, Math.min(100, Number(row.value) || 0));
      return `<div><span>${text(row.label)}</span><span class="analytics-meter" aria-label="${value}%"><span style="width:${value}%"></span></span><em>${value}%</em></div>`;
    }).join("");
  };

  const renderCountries = rows => {
    const host = document.querySelector("[data-plum-countries]");
    if (!host || !Array.isArray(rows)) return;

    host.innerHTML = rows.map(row => {
      const percent = Math.max(0, Math.min(100, Number(row.percent) || 0));
      const label = `${flagFromCode(row.countryId)} ${row.country || row.label || "(not set)"}`;
      return `<div><strong>${text(label)}</strong><span class="analytics-meter" aria-label="${percent}%"><span style="width:${percent}%"></span></span><em>${percent}%</em></div>`;
    }).join("");
  };

  const renderMap = rows => {
    const container = document.querySelector("[data-plum-map-canvas]");
    const empty = document.querySelector("[data-plum-map-empty]");
    if (!container || !Array.isArray(rows)) return;

    const mappableRows = rows.filter(row => countryCoordinates[String(row.countryId || "").toUpperCase()]);
    if (empty) empty.hidden = mappableRows.length > 0;
    if (!mappableRows.length) return;

    if (!window.maplibregl) {
      container.innerHTML = '<div class="analytics-map-fallback">MapLibre could not load. Country totals are still listed below.</div>';
      return;
    }

    if (!countryMap) {
      countryMap = new window.maplibregl.Map({
        attributionControl: false,
        center: [-18, 28],
        container,
        dragPan: false,
        interactive: false,
        pitchWithRotate: false,
        scrollZoom: false,
        style: plumMapStyle,
        zoom: 1.16
      });
      countryMap.addControl(new window.maplibregl.AttributionControl({ compact: true }), "bottom-right");
      if ("ResizeObserver" in window) {
        mapResizeObserver = new ResizeObserver(() => countryMap?.resize());
        mapResizeObserver.observe(container);
      } else {
        window.addEventListener("resize", () => countryMap?.resize());
      }
    }

    const placeMarkers = () => {
      countryMarkers.forEach(marker => marker.remove());
      countryMarkers = mappableRows.map(row => {
        const percent = Math.max(0, Math.min(100, Number(row.percent) || 0));
        const size = Math.max(22, Math.min(64, 20 + percent * 0.65));
        const countryId = String(row.countryId || "").toUpperCase();
        const markerElement = document.createElement("div");
        markerElement.className = "analytics-map-marker";
        markerElement.style.width = `${size}px`;
        markerElement.style.height = `${size}px`;
        markerElement.title = `${row.country || countryId}: ${formatNumber(row.sessions)} sessions, ${percent}%`;
        markerElement.innerHTML = `<span>${flagFromCode(countryId)}</span><strong>${percent}%</strong>`;

        return new window.maplibregl.Marker({ anchor: "center", element: markerElement })
          .setLngLat(countryCoordinates[countryId])
          .addTo(countryMap);
      });
    };

    if (countryMap.loaded()) placeMarkers();
    else countryMap.once("load", placeMarkers);
  };

  const renderPlatformPie = rows => {
    const host = document.querySelector("[data-plum-devices]");
    if (!host || !Array.isArray(rows)) return;

    if (window.echarts) {
      host.className = "analytics-echart analytics-echart--platform";
      if (!platformChart) {
        platformChart = window.echarts.init(host, null, { renderer: "svg" });
        window.addEventListener("resize", () => platformChart?.resize());
      }
      platformChart.setOption({
        color: pieColors,
        tooltip: {
          trigger: "item",
          formatter: "{b}: {c}%"
        },
        series: [{
          type: "pie",
          roseType: "radius",
          radius: ["18%", "78%"],
          center: ["50%", "52%"],
          data: rows.map(row => ({
            name: row.label || "(not set)",
            value: Math.max(0, Number(row.value) || 0)
          })),
          itemStyle: {
            borderColor: "#f8f8f8",
            borderWidth: 2,
            shadowBlur: 12,
            shadowColor: "rgba(26,29,32,0.18)"
          },
          label: {
            color: "#244026",
            fontFamily: "Space Mono",
            fontSize: 10,
            formatter: "{b}\n{c}%"
          },
          labelLine: {
            lineStyle: { color: "rgba(36,64,38,0.42)" }
          }
        }]
      });
      platformChart.resize();
      return;
    }

    const total = rows.reduce((sum, row) => sum + Math.max(0, Number(row.value) || 0), 0) || 1;
    const radius = 42;
    const circumference = 2 * Math.PI * radius;
    let offset = 0;
    const slices = rows.map((row, index) => {
      const value = Math.max(0, Number(row.value) || 0);
      const length = (value / total) * circumference;
      const slice = `<circle class="analytics-pie-slice" cx="50" cy="50" r="${radius}" fill="none" stroke="${pieColors[index % pieColors.length]}" stroke-width="18" stroke-dasharray="${length} ${circumference - length}" stroke-dashoffset="${-offset}" />`;
      offset += length;
      return slice;
    }).join("");

    host.className = "analytics-pie-wrap";
    host.innerHTML = `
      <svg class="analytics-pie" viewBox="0 0 100 100" role="img" aria-label="Platform percentage pie chart">
        <circle cx="50" cy="50" r="${radius}" fill="none" stroke="rgba(26,29,32,0.1)" stroke-width="18" />
        <g transform="rotate(-90 50 50)">${slices}</g>
        <circle cx="50" cy="50" r="25" fill="#f8f8f8" />
      </svg>
      <ol class="analytics-pie-legend">
        ${rows.map((row, index) => {
          const value = Math.max(0, Number(row.value) || 0);
          return `<li><span class="analytics-pie-swatch" style="background:${pieColors[index % pieColors.length]}"></span><strong>${text(row.label)}</strong><em>${value}%</em></li>`;
        }).join("")}
      </ol>
    `;
  };

  const renderLocationRollup = (rows, key) => {
    const counts = new Map();
    (rows || []).forEach(row => {
      const label = row[key] || row.label || "(not set)";
      const current = counts.get(label) || { label, count: 0, page: key === "country" ? "Country rollup" : row.page || "Active visitor" };
      current.count += Number(row.count || 1);
      counts.set(label, current);
    });

    renderLive([...counts.values()]
      .sort(compareNumeric("count"))
      .map(row => ({ label: row.label, page: row.page, when: `${row.count} active` })));
  };

  const chartPoint = (index, value, maxValue, count) => {
    const x = count <= 1 ? 0 : (760 / (count - 1)) * index;
    const y = 244 - (Number(value || 0) / maxValue) * 220;
    return [Number(x.toFixed(2)), Number(Math.max(16, Math.min(244, y)).toFixed(2))];
  };

  const renderVisits = (visits, rangeName = "week") => {
    if (!visits?.total?.length) return;
    const total = visits.total.map(Number);
    const unique = (visits.unique || []).map(Number);
    const sessions = (visits.sessions || total).map(Number);
    const engaged = (visits.engaged || unique).map(Number);
    const events = (visits.events || total).map(Number);
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
      const step = labels.length > 12 ? Math.ceil(labels.length / 8) : 1;
      axis.innerHTML = labels.map((label, index) => {
        const visible = index === 0 || index === labels.length - 1 || index % step === 0;
        return `<span>${visible ? text(label) : ""}</span>`;
      }).join("");
      axis.style.gridTemplateColumns = `repeat(${labels.length}, 1fr)`;
    }

    const yAxis = document.querySelector("[data-plum-y-axis]");
    if (yAxis) {
      yAxis.innerHTML = [maxValue, Math.round(maxValue * 0.66), Math.round(maxValue * 0.33), 0]
        .map(value => `<span>${formatNumber(value)}</span>`)
        .join("");
    }

    const stats = document.querySelector("[data-plum-visit-stats]");
    if (stats) {
      stats.innerHTML = `<span>${text(rangeLabels[rangeName] || rangeName)}</span><strong>${formatNumber(sumValues(total))} views</strong><em>${formatNumber(sumValues(unique))} users</em><em>${formatNumber(sumValues(sessions))} sessions</em><em>${formatNumber(sumValues(events))} events</em>`;
    }

    const chartHost = document.querySelector("[data-plum-visits-chart]");
    chartHost?.closest(".analytics-chart")?.classList.toggle("is-echart", Boolean(window.echarts));
    if (chartHost && window.echarts) {
      if (!visitsChart) {
        visitsChart = window.echarts.init(chartHost, null, { renderer: "svg" });
        window.addEventListener("resize", () => visitsChart?.resize());
      }
      const chartRows = labels.map((label, index) => ({
        name: label,
        color: visitColors[index % visitColors.length],
        values: [
          label,
          total[index] || 0,
          unique[index] || 0,
          sessions[index] || 0,
          engaged[index] || 0,
          events[index] || 0
        ]
      }));
      visitsChart.setOption({
        color: chartRows.map(row => row.color),
        legend: {
          top: 4,
          left: "center",
          type: "scroll",
          icon: "roundRect",
          itemWidth: 12,
          itemHeight: 8,
          textStyle: {
            color: "rgba(36,64,38,0.82)",
            fontFamily: "Space Mono",
            fontSize: 10
          }
        },
        tooltip: {
          trigger: "item",
          formatter: params => {
            const row = params.value || [];
            return `${text(row[0])}<br>Views: ${formatNumber(row[1])}<br>Users: ${formatNumber(row[2])}<br>Sessions: ${formatNumber(row[3])}<br>Engaged: ${formatNumber(row[4])}<br>Events: ${formatNumber(row[5])}`;
          }
        },
        parallelAxis: [
          { dim: 0, name: "Time", type: "category", data: labels, axisLabel: { color: "rgba(26,29,32,0.58)" } },
          { dim: 1, name: "Views", max: Math.max(1, ...total) },
          { dim: 2, name: "Users", max: Math.max(1, ...unique) },
          { dim: 3, name: "Sessions", max: Math.max(1, ...sessions) },
          { dim: 4, name: "Engaged", max: Math.max(1, ...engaged) },
          { dim: 5, name: "Events", max: Math.max(1, ...events) }
        ],
        parallel: {
          top: 54,
          right: 28,
          bottom: 28,
          left: 28,
          parallelAxisDefault: {
            nameGap: 12,
            nameTextStyle: { color: "#244026", fontFamily: "Space Mono", fontSize: 10 },
            axisLine: { lineStyle: { color: "rgba(36,64,38,0.24)" } },
            axisTick: { lineStyle: { color: "rgba(36,64,38,0.24)" } },
            splitLine: { lineStyle: { color: "rgba(26,29,32,0.08)" } },
            axisLabel: { color: "rgba(26,29,32,0.54)", fontFamily: "Space Mono", fontSize: 9 }
          }
        },
        series: chartRows.map(row => ({
          name: row.name,
          type: "parallel",
          smooth: true,
          lineStyle: {
            width: 3,
            color: row.color,
            opacity: 0.46
          },
          emphasis: {
            focus: "series",
            lineStyle: {
              width: 5,
              opacity: 0.95
            }
          },
          data: [row.values]
        }))
      });
      visitsChart.resize();
    }
  };

  const renderPanelView = (tabName, view) => {
    if (!currentSnapshot) return;

    if (tabName === "visits") {
      renderVisits(currentSnapshot.visitRanges?.[view] || currentSnapshot.visits, view);
      return;
    }

    if (tabName === "referrers") {
      const rows = view === "repeat" ? currentSnapshot.referrerRepeats || currentSnapshot.referrers : currentSnapshot.referrers;
      renderTable("referrers", rows, ["source", "hits"]);
      return;
    }

    if (tabName === "pages") {
      const rows = view === "recent" ? reverseRows(currentSnapshot.pages) : currentSnapshot.pages;
      renderTable("pages", rows, ["page", "views"]);
      return;
    }

    if (tabName === "live") {
      if (view === "city") renderLocationRollup(currentSnapshot.live, "label");
      else if (view === "country") renderLocationRollup(currentSnapshot.live, "country");
      else renderLive(currentSnapshot.live);
      return;
    }

    if (tabName === "searches") {
      const rows = view === "recent" ? reverseRows(currentSnapshot.searches) : currentSnapshot.searches;
      renderTable("searches", rows, ["query", "hits"]);
      return;
    }

    if (tabName === "devices") {
      if (view === "platform") renderPlatformPie(currentSnapshot.platforms || currentSnapshot.devices);
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
      renderGenerated(snapshot.generatedAt);
      renderSummary(snapshot.summary);
      renderVisits(snapshot.visitRanges?.week || snapshot.visits, "week");
      renderTable("referrers", snapshot.referrers, ["source", "hits"]);
      renderTable("pages", snapshot.pages, ["page", "views"]);
      renderTable("crushes", snapshot.crushes, ["page", "views"]);
      renderTable("entryPages", snapshot.entryPages, ["page", "sessions"]);
      renderTable("browsers", snapshot.browsers, ["name", "percent"]);
      renderCountries(snapshot.countries);
      renderMap(snapshot.countries);
      renderTable("providers", snapshot.providers, ["provider", "sessions"]);
      renderTable("searches", snapshot.searches, ["query", "hits"]);
      renderLive(snapshot.live);
      renderPlatformPie(snapshot.platforms || snapshot.devices);
    })
    .catch(() => {});
})();
