const crypto = require("node:crypto");
const fs = require("node:fs/promises");

const outputPath = "src/data/plum.json";
const propertyId = process.env.GA_PROPERTY_ID;
const clientEmail = process.env.GA_CLIENT_EMAIL;
const privateKey = process.env.GA_PRIVATE_KEY?.replace(/\\n/g, "\n");
const accessToken = process.env.GA_ACCESS_TOKEN;

const sample = {
  generatedAt: new Date().toISOString(),
  source: "sample",
  summary: [
    { id: "today", label: "Today", value: "1,284", trend: "+18%" },
    { id: "unique", label: "Unique", value: "742", trend: "+9%" },
    { id: "referrals", label: "Referrals", value: "391", trend: "31%" },
    { id: "live", label: "Live", value: "27", trend: "snapshot" }
  ],
  visits: {
    labels: ["Th", "F", "Sa", "Su", "M", "Tu", "W"],
    total: [6280, 8120, 2140, 1680, 9405, 3410, 420],
    unique: [4320, 5710, 1610, 1220, 5480, 1960, 210]
  },
  visitRanges: {
    day: {
      labels: ["00", "04", "08", "12", "16", "20"],
      total: [8, 12, 19, 34, 42, 28],
      unique: [5, 8, 13, 24, 30, 19],
      sessions: [6, 10, 16, 28, 35, 22],
      engaged: [4, 7, 11, 21, 26, 16],
      events: [38, 55, 91, 168, 220, 132]
    },
    week: {
      labels: ["Th", "F", "Sa", "Su", "M", "Tu", "W"],
      total: [6280, 8120, 2140, 1680, 9405, 3410, 420],
      unique: [4320, 5710, 1610, 1220, 5480, 1960, 210],
      sessions: [5120, 6900, 1830, 1390, 7480, 2820, 360],
      engaged: [3820, 5140, 1180, 920, 5910, 1960, 210],
      events: [28260, 36480, 9120, 7140, 42300, 15680, 1920]
    },
    month: {
      labels: ["W1", "W2", "W3", "W4", "Now"],
      total: [1080, 1410, 1760, 1320, 980],
      unique: [690, 900, 1110, 840, 620],
      sessions: [850, 1120, 1390, 1010, 760],
      engaged: [590, 790, 980, 710, 520],
      events: [4860, 6500, 8120, 6040, 4380]
    },
    year: {
      labels: ["Aug", "Oct", "Dec", "Feb", "Apr", "Jun"],
      total: [1100, 1840, 1280, 2190, 2540, 3030],
      unique: [690, 1130, 780, 1410, 1600, 1880],
      sessions: [860, 1450, 1010, 1710, 1980, 2360],
      engaged: [610, 1020, 690, 1190, 1390, 1670],
      events: [5120, 8460, 6020, 10380, 11920, 14240]
    }
  },
  referrers: [
    { source: "instagram.com", hits: 184 },
    { source: "behance.net", hits: 121 },
    { source: "google.com", hits: 97 },
    { source: "linkedin.com", hits: 84 },
    { source: "vimeo.com", hits: 62 },
    { source: "direct / bookmark", hits: 58 }
  ],
  referrerRepeats: [
    { source: "google.com", hits: 61 },
    { source: "linkedin.com", hits: 44 },
    { source: "instagram.com", hits: 39 },
    { source: "direct / bookmark", hits: 33 },
    { source: "behance.net", hits: 26 },
    { source: "vimeo.com", hits: 17 }
  ],
  pages: [
    { page: "/work/the-colony/", views: 411 },
    { page: "/work/signal-lattice/", views: 306 },
    { page: "/photography/", views: 248 },
    { page: "/work/transit/", views: 219 },
    { page: "/about/", views: 173 },
    { page: "/illustration/", views: 149 }
  ],
  crushes: [
    { page: "/work/signal-lattice/", views: 88 },
    { page: "/photography/", views: 61 },
    { page: "/about/", views: 39 },
    { page: "/work/the-colony/", views: 34 }
  ],
  entryPages: [
    { page: "/", sessions: 188 },
    { page: "/work/", sessions: 96 },
    { page: "/photography/", sessions: 72 },
    { page: "/about/", sessions: 54 },
    { page: "/illustration/", sessions: 33 }
  ],
  browsers: [
    { name: "Safari", percent: 46 },
    { name: "Chrome", percent: 38 },
    { name: "Firefox", percent: 8 },
    { name: "Edge", percent: 5 },
    { name: "Samsung Internet", percent: 3 }
  ],
  countries: [
    { country: "United States", countryId: "US", sessions: 330, percent: 68 },
    { country: "Canada", countryId: "CA", sessions: 58, percent: 12 },
    { country: "United Kingdom", countryId: "GB", sessions: 44, percent: 9 },
    { country: "Germany", countryId: "DE", sessions: 29, percent: 6 },
    { country: "France", countryId: "FR", sessions: 24, percent: 5 }
  ],
  providers: [
    { provider: "Direct", sessions: 220 },
    { provider: "Organic Search", sessions: 144 },
    { provider: "Referral", sessions: 88 },
    { provider: "Organic Social", sessions: 42 },
    { provider: "Unassigned", sessions: 18 }
  ],
  searches: [
    { query: "cinematic ui design", hits: 37 },
    { query: "new orleans art director", hits: 29 },
    { query: "fui hud artist", hits: 21 },
    { query: "ron domingue reel", hits: 18 },
    { query: "unreal interface concepts", hits: 12 }
  ],
  live: [
    { label: "New Orleans", country: "United States", page: "/work/black-noise/", when: "snapshot" },
    { label: "Brooklyn", country: "United States", page: "/work/grid-state/", when: "snapshot" },
    { label: "Austin", country: "United States", page: "/photography/", when: "snapshot" },
    { label: "Los Angeles", country: "United States", page: "/work/data-haven/", when: "snapshot" },
    { label: "Toronto", country: "Canada", page: "/about/", when: "snapshot" },
    { label: "London", country: "United Kingdom", page: "/work/hud-schema-signal/", when: "snapshot" },
    { label: "Berlin", country: "Germany", page: "/work/missionlaunch/", when: "snapshot" }
  ],
  devices: [
    { label: "Desktop", value: 58 },
    { label: "Mobile", value: 34 },
    { label: "Tablet", value: 8 },
    { label: "Dark mode", value: 71 }
  ],
  platforms: [
    { label: "Macintosh", value: 63 },
    { label: "iOS", value: 21 },
    { label: "Windows", value: 12 },
    { label: "Android", value: 4 }
  ],
  screens: [
    { label: "390x844", value: 34 },
    { label: "1440x900", value: 22 },
    { label: "1920x1080", value: 18 },
    { label: "unknown", value: 9 }
  ]
};

const encodeBase64Url = value =>
  Buffer.from(value).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

const formatNumber = value => Number(value || 0).toLocaleString("en-US");
const numeric = value => Number.parseInt(value || "0", 10) || 0;

const weekdayLabel = yyyymmdd => {
  const year = yyyymmdd.slice(0, 4);
  const month = yyyymmdd.slice(4, 6);
  const day = yyyymmdd.slice(6, 8);
  return new Intl.DateTimeFormat("en-US", { weekday: "short" })
    .format(new Date(`${year}-${month}-${day}T00:00:00Z`))
    .slice(0, 2);
};

const dateLabel = yyyymmdd => {
  if (!yyyymmdd || yyyymmdd.length < 8) return "";
  return `${Number(yyyymmdd.slice(4, 6))}/${Number(yyyymmdd.slice(6, 8))}`;
};

const hourLabel = yyyymmddhh => {
  if (!yyyymmddhh || yyyymmddhh.length < 10) return "";
  return yyyymmddhh.slice(8, 10);
};

const monthLabel = yyyymm => {
  if (!yyyymm || yyyymm.length < 6) return "";
  const date = new Date(`${yyyymm.slice(0, 4)}-${yyyymm.slice(4, 6)}-01T00:00:00Z`);
  return new Intl.DateTimeFormat("en-US", { month: "short" }).format(date);
};

const buildVisitRange = (report, labelFormatter) => {
  const reportRows = rows(report);
  const range = {
    labels: reportRows.map(row => labelFormatter(row.dimensionValues[0]?.value || "")),
    total: reportRows.map(row => numeric(row.metricValues[0]?.value)),
    unique: reportRows.map(row => numeric(row.metricValues[1]?.value)),
    sessions: reportRows.map(row => numeric(row.metricValues[2]?.value)),
    engaged: reportRows.map(row => numeric(row.metricValues[3]?.value)),
    events: reportRows.map(row => numeric(row.metricValues[4]?.value))
  };
  range.rows = range.labels.map((label, index) => ({
    label,
    total: range.total[index] || 0,
    unique: range.unique[index] || 0,
    sessions: range.sessions[index] || 0,
    engaged: range.engaged[index] || 0,
    events: range.events[index] || 0
  }));
  return range;
};

async function writeSnapshot(snapshot) {
  await fs.mkdir("src/data", { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(`Wrote ${outputPath} from ${snapshot.source}.`);
}

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = encodeBase64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = encodeBase64Url(JSON.stringify({
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/analytics.readonly",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now
  }));
  const unsignedToken = `${header}.${payload}`;
  const signature = crypto.createSign("RSA-SHA256").update(unsignedToken).sign(privateKey, "base64")
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsignedToken}.${signature}`
    })
  });

  if (!response.ok) {
    throw new Error(`OAuth token request failed: ${response.status} ${await response.text()}`);
  }

  return (await response.json()).access_token;
}

async function runReport(accessToken, body) {
  const response = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`GA runReport failed: ${response.status} ${await response.text()}`);
  }

  return response.json();
}

async function runRealtimeReport(accessToken, body) {
  const response = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runRealtimeReport`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) return null;
  return response.json();
}

const rows = report => report.rows || [];

async function buildSnapshot() {
  if (!propertyId || (!accessToken && (!clientEmail || !privateKey))) {
    await writeSnapshot(sample);
    return;
  }

  const token = accessToken || await getAccessToken();
  const [summaryReport, dayVisitsReport, visitsReport, monthVisitsReport, yearVisitsReport, referrersReport, referrerRepeatsReport, pagesReport, crushesReport, entryPagesReport, browsersReport, countriesReport, providersReport, devicesReport, platformsReport, screensReport, realtimeReport] = await Promise.all([
    runReport(token, {
      dateRanges: [{ startDate: "today", endDate: "today" }, { startDate: "yesterday", endDate: "yesterday" }],
      metrics: [{ name: "screenPageViews" }, { name: "activeUsers" }, { name: "sessions" }]
    }),
    runReport(token, {
      dateRanges: [{ startDate: "today", endDate: "today" }],
      dimensions: [{ name: "dateHour" }],
      metrics: [{ name: "screenPageViews" }, { name: "activeUsers" }, { name: "sessions" }, { name: "engagedSessions" }, { name: "eventCount" }],
      orderBys: [{ dimension: { dimensionName: "dateHour" } }]
    }),
    runReport(token, {
      dateRanges: [{ startDate: "6daysAgo", endDate: "today" }],
      dimensions: [{ name: "date" }],
      metrics: [{ name: "screenPageViews" }, { name: "activeUsers" }, { name: "sessions" }, { name: "engagedSessions" }, { name: "eventCount" }],
      orderBys: [{ dimension: { dimensionName: "date" } }]
    }),
    runReport(token, {
      dateRanges: [{ startDate: "29daysAgo", endDate: "today" }],
      dimensions: [{ name: "date" }],
      metrics: [{ name: "screenPageViews" }, { name: "activeUsers" }, { name: "sessions" }, { name: "engagedSessions" }, { name: "eventCount" }],
      orderBys: [{ dimension: { dimensionName: "date" } }]
    }),
    runReport(token, {
      dateRanges: [{ startDate: "365daysAgo", endDate: "today" }],
      dimensions: [{ name: "yearMonth" }],
      metrics: [{ name: "screenPageViews" }, { name: "activeUsers" }, { name: "sessions" }, { name: "engagedSessions" }, { name: "eventCount" }],
      orderBys: [{ dimension: { dimensionName: "yearMonth" } }]
    }),
    runReport(token, {
      dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
      dimensions: [{ name: "sessionSource" }],
      metrics: [{ name: "sessions" }],
      limit: 8,
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }]
    }),
    runReport(token, {
      dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
      dimensions: [{ name: "sessionSource" }],
      metrics: [{ name: "engagedSessions" }],
      limit: 8,
      orderBys: [{ metric: { metricName: "engagedSessions" }, desc: true }]
    }),
    runReport(token, {
      dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
      dimensions: [{ name: "pagePath" }],
      metrics: [{ name: "screenPageViews" }],
      limit: 8,
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }]
    }),
    runReport(token, {
      dateRanges: [{ startDate: "today", endDate: "today" }],
      dimensions: [{ name: "pagePath" }],
      metrics: [{ name: "screenPageViews" }],
      limit: 6,
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }]
    }),
    runReport(token, {
      dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
      dimensions: [{ name: "landingPagePlusQueryString" }],
      metrics: [{ name: "sessions" }],
      limit: 6,
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }]
    }),
    runReport(token, {
      dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
      dimensions: [{ name: "browser" }],
      metrics: [{ name: "sessions" }],
      limit: 6,
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }]
    }),
    runReport(token, {
      dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
      dimensions: [{ name: "country" }, { name: "countryId" }],
      metrics: [{ name: "sessions" }],
      limit: 6,
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }]
    }),
    runReport(token, {
      dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
      dimensions: [{ name: "sessionDefaultChannelGroup" }],
      metrics: [{ name: "sessions" }],
      limit: 6,
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }]
    }),
    runReport(token, {
      dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
      dimensions: [{ name: "deviceCategory" }],
      metrics: [{ name: "sessions" }],
      limit: 6,
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }]
    }),
    runReport(token, {
      dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
      dimensions: [{ name: "operatingSystem" }],
      metrics: [{ name: "sessions" }],
      limit: 6,
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }]
    }),
    runReport(token, {
      dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
      dimensions: [{ name: "screenResolution" }],
      metrics: [{ name: "sessions" }],
      limit: 6,
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }]
    }),
    runRealtimeReport(token, {
      dimensions: [{ name: "city" }, { name: "country" }, { name: "unifiedScreenName" }],
      metrics: [{ name: "activeUsers" }],
      limit: 8,
      orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }]
    })
  ]);

  const today = summaryReport.rows?.[0]?.metricValues || [];
  const yesterday = summaryReport.rows?.[1]?.metricValues || [];
  const todayViews = numeric(today[0]?.value);
  const todayUsers = numeric(today[1]?.value);
  const todaySessions = numeric(today[2]?.value);
  const yesterdayViews = numeric(yesterday[0]?.value);
  const referrerSessions = rows(referrersReport).reduce((sum, row) => sum + numeric(row.metricValues[0]?.value), 0);
  const deviceSessions = rows(devicesReport).reduce((sum, row) => sum + numeric(row.metricValues[0]?.value), 0) || 1;
  const browserSessions = rows(browsersReport).reduce((sum, row) => sum + numeric(row.metricValues[0]?.value), 0) || 1;
  const countrySessions = rows(countriesReport).reduce((sum, row) => sum + numeric(row.metricValues[0]?.value), 0) || 1;
  const platformSessions = rows(platformsReport).reduce((sum, row) => sum + numeric(row.metricValues[0]?.value), 0) || 1;
  const screenSessions = rows(screensReport).reduce((sum, row) => sum + numeric(row.metricValues[0]?.value), 0) || 1;
  const realtimeUsers = rows(realtimeReport || {}).reduce((sum, row) => sum + numeric(row.metricValues[0]?.value), 0);
  const delta = yesterdayViews ? Math.round(((todayViews - yesterdayViews) / yesterdayViews) * 100) : 0;

  const visitsRows = rows(visitsReport);
  const totalSeries = visitsRows.map(row => numeric(row.metricValues[0]?.value));
  const uniqueSeries = visitsRows.map(row => numeric(row.metricValues[1]?.value));

  await writeSnapshot({
    generatedAt: new Date().toISOString(),
    source: "ga4",
    summary: [
      { id: "today", label: "Today", value: formatNumber(todayViews), trend: `${delta >= 0 ? "+" : ""}${delta}%` },
      { id: "unique", label: "Unique", value: formatNumber(todayUsers), trend: `${formatNumber(todaySessions)} sessions` },
      { id: "referrals", label: "Referrals", value: formatNumber(referrerSessions), trend: "30d" },
      { id: "live", label: "Live", value: formatNumber(realtimeUsers), trend: "snapshot" }
    ],
    visits: {
      labels: visitsRows.map(row => weekdayLabel(row.dimensionValues[0]?.value || "")),
      total: totalSeries,
      unique: uniqueSeries
    },
    visitRanges: {
      day: buildVisitRange(dayVisitsReport, hourLabel),
      week: buildVisitRange(visitsReport, weekdayLabel),
      month: buildVisitRange(monthVisitsReport, dateLabel),
      year: buildVisitRange(yearVisitsReport, monthLabel)
    },
    referrers: rows(referrersReport).map(row => ({
      source: row.dimensionValues[0]?.value || "(not set)",
      hits: numeric(row.metricValues[0]?.value)
    })),
    referrerRepeats: rows(referrerRepeatsReport).map(row => ({
      source: row.dimensionValues[0]?.value || "(not set)",
      hits: numeric(row.metricValues[0]?.value)
    })),
    pages: rows(pagesReport).map(row => ({
      page: row.dimensionValues[0]?.value || "/",
      views: numeric(row.metricValues[0]?.value)
    })),
    crushes: rows(crushesReport).map(row => ({
      page: row.dimensionValues[0]?.value || "/",
      views: numeric(row.metricValues[0]?.value)
    })),
    entryPages: rows(entryPagesReport).map(row => ({
      page: row.dimensionValues[0]?.value || "/",
      sessions: numeric(row.metricValues[0]?.value)
    })),
    browsers: rows(browsersReport).map(row => ({
      name: row.dimensionValues[0]?.value || "(not set)",
      percent: Math.round((numeric(row.metricValues[0]?.value) / browserSessions) * 100)
    })),
    countries: rows(countriesReport).map(row => ({
      country: row.dimensionValues[0]?.value || "(not set)",
      countryId: row.dimensionValues[1]?.value || "",
      sessions: numeric(row.metricValues[0]?.value),
      percent: Math.round((numeric(row.metricValues[0]?.value) / countrySessions) * 100)
    })),
    providers: rows(providersReport).map(row => ({
      provider: row.dimensionValues[0]?.value || "(not set)",
      sessions: numeric(row.metricValues[0]?.value)
    })),
    searches: sample.searches,
    live: rows(realtimeReport || {}).map(row => ({
      label: row.dimensionValues[0]?.value || "(not set)",
      country: row.dimensionValues[1]?.value || "(not set)",
      page: row.dimensionValues[2]?.value || "Active visitor",
      when: "last 30m",
      count: numeric(row.metricValues[0]?.value)
    })),
    devices: rows(devicesReport).map(row => ({
      label: row.dimensionValues[0]?.value || "(not set)",
      value: Math.round((numeric(row.metricValues[0]?.value) / deviceSessions) * 100)
    })),
    platforms: rows(platformsReport).map(row => ({
      label: row.dimensionValues[0]?.value || "(not set)",
      value: Math.round((numeric(row.metricValues[0]?.value) / platformSessions) * 100)
    })),
    screens: rows(screensReport).map(row => ({
      label: row.dimensionValues[0]?.value || "(not set)",
      value: Math.round((numeric(row.metricValues[0]?.value) / screenSessions) * 100)
    }))
  });
}

buildSnapshot().catch(async error => {
  console.error(error.message);
  await writeSnapshot({ ...sample, generatedAt: new Date().toISOString(), source: "sample-error" });
});
