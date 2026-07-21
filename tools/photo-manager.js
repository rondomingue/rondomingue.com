#!/usr/bin/env node

const fs = require("fs");
const http = require("http");
const path = require("path");
const { execFile } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const PHOTO_DIR = path.join(ROOT, "src/images/work/photography");
const PHOTO_SRC_PREFIX = "images/work/photography/";
const DATA_FILE = path.join(ROOT, "src/_data/photographs.json");
const PORT = Number(process.env.PHOTO_MANAGER_PORT || 4322);
const IMAGE_EXTENSIONS = new Set([".avif", ".jpg", ".jpeg", ".png", ".webp"]);

const sendJson = (response, status, body) => {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(body, null, 2));
};

const sendText = (response, status, text, contentType = "text/plain; charset=utf-8") => {
  response.writeHead(status, {
    "Content-Type": contentType,
    "Cache-Control": "no-store"
  });
  response.end(text);
};

const readBody = request => new Promise((resolve, reject) => {
  let body = "";
  request.on("data", chunk => {
    body += chunk;
    if (body.length > 1_000_000) {
      request.destroy();
      reject(new Error("Request body is too large."));
    }
  });
  request.on("end", () => {
    try {
      resolve(body ? JSON.parse(body) : {});
    } catch {
      reject(new Error("Request body must be valid JSON."));
    }
  });
  request.on("error", reject);
});

const isImageFile = fileName => IMAGE_EXTENSIONS.has(path.extname(fileName).toLowerCase());
const loadPhotos = () => JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));

const savePhotos = photos => {
  const normalized = photos.map((photo, index) => ({
    ...photo,
    alt: `Photography by Ron Domingue — ${index + 1}`
  }));

  fs.writeFileSync(DATA_FILE, `${JSON.stringify(normalized, null, 2)}\n`);
  return normalized;
};

const listImageFiles = () => fs.readdirSync(PHOTO_DIR)
  .filter(fileName => !fileName.startsWith(".") && isImageFile(fileName))
  .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
  .map(fileName => `${PHOTO_SRC_PREFIX}${fileName}`);

const listSidecars = () => fs.readdirSync(PHOTO_DIR)
  .filter(fileName => fileName.startsWith("._"))
  .sort()
  .map(fileName => path.join("src/images/work/photography", fileName));

const getImageMetadata = src => new Promise(resolve => {
  const fullPath = path.join(ROOT, "src", src);
  execFile("sips", ["-g", "pixelWidth", "-g", "pixelHeight", fullPath], (error, stdout) => {
    if (error) {
      resolve({ width: 0, height: 0, orientation: "landscape" });
      return;
    }

    const width = Number(stdout.match(/pixelWidth:\s*(\d+)/)?.[1] || 0);
    const height = Number(stdout.match(/pixelHeight:\s*(\d+)/)?.[1] || 0);
    resolve({ width, height, orientation: height > width ? "portrait" : "landscape" });
  });
});

const buildState = () => {
  const photos = loadPhotos();
  const files = listImageFiles();
  const fileSet = new Set(files);
  const photoSet = new Set(photos.map(photo => photo.src));
  const seen = new Set();
  const duplicates = [];

  for (const photo of photos) {
    if (seen.has(photo.src)) duplicates.push(photo.src);
    seen.add(photo.src);
  }

  return {
    count: {
      entries: photos.length,
      files: files.length,
      missing: files.filter(src => !photoSet.has(src)).length,
      orphaned: photos.filter(photo => !fileSet.has(photo.src)).length,
      sidecars: listSidecars().length,
      duplicates: duplicates.length
    },
    photos: photos.map((photo, index) => ({
      ...photo,
      index,
      exists: fileSet.has(photo.src),
      url: `/${photo.src}`
    })),
    missing: files.filter(src => !photoSet.has(src)).map(src => ({ src, url: `/${src}` })),
    orphaned: photos.filter(photo => !fileSet.has(photo.src)),
    sidecars: listSidecars(),
    duplicates
  };
};

const addMissing = async () => {
  const photos = loadPhotos();
  const photoSet = new Set(photos.map(photo => photo.src));
  const missing = listImageFiles().filter(src => !photoSet.has(src));
  const additions = [];

  for (const src of missing) {
    const metadata = await getImageMetadata(src);
    additions.push({ src, alt: "", ...metadata });
  }

  savePhotos([...photos, ...additions]);
  return additions.length;
};

const regenerateMetadata = async targetSrc => {
  const photos = loadPhotos();
  let updated = 0;

  for (const photo of photos) {
    if (targetSrc && photo.src !== targetSrc) continue;
    if (!fs.existsSync(path.join(ROOT, "src", photo.src))) continue;
    Object.assign(photo, await getImageMetadata(photo.src));
    updated += 1;
  }

  savePhotos(photos);
  return updated;
};

const removeEntry = src => {
  const photos = loadPhotos();
  const nextPhotos = photos.filter(photo => photo.src !== src);
  savePhotos(nextPhotos);
  return photos.length - nextPhotos.length;
};

const moveEntry = (src, direction) => {
  const photos = loadPhotos();
  const index = photos.findIndex(photo => photo.src === src);
  if (index === -1) return false;
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= photos.length) return false;
  [photos[index], photos[targetIndex]] = [photos[targetIndex], photos[index]];
  savePhotos(photos);
  return true;
};

const scrubSidecars = () => {
  let removed = 0;
  for (const fileName of fs.readdirSync(PHOTO_DIR)) {
    if (!fileName.startsWith("._")) continue;
    fs.unlinkSync(path.join(PHOTO_DIR, fileName));
    removed += 1;
  }
  return removed;
};

const appHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Photo Manager</title>
  <style>
    :root {
      --bg: #f6f3ef;
      --panel: #fff;
      --text: #191816;
      --muted: #68645f;
      --line: #ded8d0;
      --accent: #1b6c72;
      --danger: #9f2d20;
      --shadow: 0 16px 40px rgba(31, 27, 21, 0.12);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--text);
    }
    header {
      position: sticky;
      top: 0;
      z-index: 5;
      background: rgba(246, 243, 239, 0.94);
      border-bottom: 1px solid var(--line);
      backdrop-filter: blur(18px);
    }
    .bar {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 16px;
      align-items: center;
      max-width: 1440px;
      margin: 0 auto;
      padding: 16px 20px;
    }
    h1 { margin: 0; font-size: 22px; font-weight: 760; letter-spacing: 0; }
    .subtitle { margin-top: 3px; color: var(--muted); font-size: 13px; }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
    button, select {
      min-height: 36px;
      border: 1px solid var(--line);
      border-radius: 7px;
      background: var(--panel);
      color: var(--text);
      font: inherit;
      font-size: 13px;
      padding: 7px 11px;
    }
    button { cursor: pointer; box-shadow: 0 1px 0 rgba(0,0,0,0.04); }
    button:hover { border-color: #b8aea3; }
    button.primary { background: var(--accent); border-color: var(--accent); color: white; }
    button.danger { color: var(--danger); }
    main { max-width: 1440px; margin: 0 auto; padding: 18px 20px 40px; }
    .stats {
      display: grid;
      grid-template-columns: repeat(6, minmax(110px, 1fr));
      gap: 10px;
      margin-bottom: 18px;
    }
    .stat {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 12px;
    }
    .stat strong { display: block; font-size: 22px; line-height: 1; margin-bottom: 6px; }
    .stat span { color: var(--muted); font-size: 12px; }
    .notice {
      display: none;
      margin: 0 0 16px;
      border-radius: 8px;
      padding: 11px 12px;
      background: #fff8dc;
      border: 1px solid #ead891;
      color: #5c4b04;
      font-size: 13px;
    }
    .notice.active { display: block; }
    .toolbar {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 12px;
      align-items: center;
      margin-bottom: 14px;
    }
    input[type="search"] {
      width: 100%;
      min-height: 38px;
      border: 1px solid var(--line);
      border-radius: 7px;
      padding: 8px 11px;
      background: white;
      font: inherit;
      font-size: 14px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 12px;
    }
    .card {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 1px 0 rgba(0,0,0,0.03);
    }
    .card.missing-file { border-color: #d8a29a; }
    .thumb {
      aspect-ratio: 4 / 3;
      background: #e5ded5;
      display: block;
      width: 100%;
      object-fit: cover;
    }
    .meta { padding: 10px; display: grid; gap: 9px; }
    .name { font-size: 13px; font-weight: 680; overflow-wrap: anywhere; }
    .detail { color: var(--muted); font-size: 12px; display: flex; flex-wrap: wrap; gap: 6px; }
    .card-actions { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
    .card-actions button { min-height: 32px; padding: 5px 7px; font-size: 12px; }
    .section-title { margin: 24px 0 10px; font-size: 16px; }
    .empty {
      padding: 18px;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      color: var(--muted);
      font-size: 14px;
    }
    .toast {
      position: fixed;
      left: 50%;
      bottom: 18px;
      transform: translateX(-50%);
      min-width: min(480px, calc(100vw - 32px));
      padding: 12px 14px;
      border-radius: 8px;
      background: #191816;
      color: white;
      box-shadow: var(--shadow);
      opacity: 0;
      pointer-events: none;
      transition: opacity 160ms ease;
      font-size: 14px;
      text-align: center;
    }
    .toast.active { opacity: 1; }
    @media (max-width: 820px) {
      .bar, .toolbar { grid-template-columns: 1fr; }
      .actions { justify-content: stretch; }
      .actions button, .actions select { flex: 1 1 auto; }
      .stats { grid-template-columns: repeat(2, 1fr); }
    }
  </style>
</head>
<body>
  <header>
    <div class="bar">
      <div>
        <h1>Photo Manager</h1>
        <div class="subtitle">Local editor for src/_data/photographs.json</div>
      </div>
      <div class="actions">
        <button class="primary" id="addMissing">Add Missing</button>
        <button id="regenAll">Regenerate Metadata</button>
        <button id="scrubSidecars">Scrub Sidecars</button>
        <button id="refresh">Refresh</button>
      </div>
    </div>
  </header>
  <main>
    <div class="stats" id="stats"></div>
    <div class="notice" id="notice"></div>
    <div class="toolbar">
      <input id="search" type="search" placeholder="Search filenames">
      <select id="filter" aria-label="Filter photos">
        <option value="all">All JSON entries</option>
        <option value="portrait">Portrait</option>
        <option value="landscape">Landscape</option>
        <option value="missing-file">Missing file entries</option>
      </select>
    </div>
    <section><div class="grid" id="photos"></div></section>
    <section>
      <h2 class="section-title">Missing From JSON</h2>
      <div id="missing"></div>
    </section>
    <section>
      <h2 class="section-title">Orphaned JSON Entries</h2>
      <div id="orphaned"></div>
    </section>
  </main>
  <div class="toast" id="toast"></div>
  <script>
    const state = { data: null, search: "", filter: "all" };
    const el = id => document.getElementById(id);
    const toast = message => {
      el("toast").textContent = message;
      el("toast").classList.add("active");
      setTimeout(() => el("toast").classList.remove("active"), 1800);
    };
    const api = async (path, body) => {
      const response = await fetch(path, {
        method: body ? "POST" : "GET",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Request failed.");
      return data;
    };
    const fileName = src => src.split("/").pop();
    const renderStats = () => {
      const count = state.data.count;
      const stats = [["Entries", count.entries], ["Files", count.files], ["Missing", count.missing], ["Orphaned", count.orphaned], ["Sidecars", count.sidecars], ["Duplicates", count.duplicates]];
      el("stats").innerHTML = stats.map(([label, value]) => \`<div class="stat"><strong>\${value}</strong><span>\${label}</span></div>\`).join("");
      const warnings = [];
      if (count.missing) warnings.push(\`\${count.missing} image file(s) are not in the JSON.\`);
      if (count.orphaned) warnings.push(\`\${count.orphaned} JSON entr\${count.orphaned === 1 ? "y points" : "ies point"} to missing files.\`);
      if (count.sidecars) warnings.push(\`\${count.sidecars} macOS sidecar file(s) are in the photography folder.\`);
      if (count.duplicates) warnings.push(\`\${count.duplicates} duplicate JSON path(s) found.\`);
      el("notice").textContent = warnings.join(" ");
      el("notice").classList.toggle("active", warnings.length > 0);
    };
    const photoCard = photo => \`
      <article class="card \${photo.exists ? "" : "missing-file"}">
        \${photo.exists ? \`<img class="thumb" src="\${photo.url}" alt="\${photo.alt}" loading="lazy">\` : \`<div class="thumb"></div>\`}
        <div class="meta">
          <div class="name">\${photo.index + 1}. \${fileName(photo.src)}</div>
          <div class="detail"><span>\${photo.orientation}</span><span>\${photo.width} x \${photo.height}</span>\${photo.exists ? "" : "<span>missing file</span>"}</div>
          <div class="card-actions">
            <button data-action="up" data-src="\${photo.src}">Up</button>
            <button data-action="down" data-src="\${photo.src}">Down</button>
            <button data-action="regen" data-src="\${photo.src}">Meta</button>
            <button class="danger" data-action="remove" data-src="\${photo.src}">Remove JSON</button>
          </div>
        </div>
      </article>\`;
    const missingCard = item => \`
      <article class="card">
        <img class="thumb" src="\${item.url}" alt="" loading="lazy">
        <div class="meta">
          <div class="name">\${fileName(item.src)}</div>
          <div class="card-actions"><button class="primary" data-action="add-all">Add Missing</button></div>
        </div>
      </article>\`;
    const render = () => {
      renderStats();
      const search = state.search.toLowerCase();
      const photos = state.data.photos.filter(photo => {
        if (search && !photo.src.toLowerCase().includes(search)) return false;
        if (state.filter === "portrait" || state.filter === "landscape") return photo.orientation === state.filter;
        if (state.filter === "missing-file") return !photo.exists;
        return true;
      });
      el("photos").innerHTML = photos.length ? photos.map(photoCard).join("") : '<div class="empty">No matching photos.</div>';
      el("missing").innerHTML = state.data.missing.length ? \`<div class="grid">\${state.data.missing.map(missingCard).join("")}</div>\` : '<div class="empty">No missing files. The folder and JSON match.</div>';
      el("orphaned").innerHTML = state.data.orphaned.length ? \`<div class="empty">\${state.data.orphaned.map(photo => photo.src).join("<br>")}</div>\` : '<div class="empty">No orphaned JSON entries.</div>';
    };
    const refresh = async () => {
      state.data = await api("/api/state");
      render();
    };
    const mutate = async (path, body, message) => {
      await api(path, body);
      await refresh();
      toast(message);
    };
    document.addEventListener("click", async event => {
      const button = event.target.closest("button");
      if (!button) return;
      const action = button.dataset.action || button.id;
      const src = button.dataset.src;
      try {
        if (action === "refresh") await refresh();
        if (action === "addMissing" || action === "add-all") await mutate("/api/add-missing", {}, "Missing photos added.");
        if (action === "regenAll") await mutate("/api/regenerate", {}, "Metadata regenerated.");
        if (action === "scrubSidecars") await mutate("/api/scrub-sidecars", {}, "Sidecars removed.");
        if (action === "up" || action === "down") await mutate("/api/move", { src, direction: action }, "Photo moved.");
        if (action === "regen") await mutate("/api/regenerate", { src }, "Metadata updated.");
        if (action === "remove" && confirm("Remove this entry from photographs.json? The image file will stay in the folder.")) {
          await mutate("/api/remove-entry", { src }, "JSON entry removed.");
        }
      } catch (error) {
        toast(error.message);
      }
    });
    el("search").addEventListener("input", event => {
      state.search = event.target.value;
      render();
    });
    el("filter").addEventListener("change", event => {
      state.filter = event.target.value;
      render();
    });
    refresh().catch(error => toast(error.message));
  </script>
</body>
</html>`;

const serveImage = (request, response) => {
  const url = new URL(request.url, "http://localhost");
  const decodedPath = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  const fullPath = path.normalize(path.join(ROOT, "src", decodedPath));
  const allowedPath = path.join(ROOT, "src/images/work/photography");

  if (!fullPath.startsWith(allowedPath)) {
    sendText(response, 403, "Forbidden");
    return;
  }
  if (!fs.existsSync(fullPath)) {
    sendText(response, 404, "Not found");
    return;
  }

  const extension = path.extname(fullPath).toLowerCase();
  const contentTypes = {
    ".avif": "image/avif",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp"
  };
  response.writeHead(200, {
    "Content-Type": contentTypes[extension] || "application/octet-stream",
    "Cache-Control": "no-store"
  });
  fs.createReadStream(fullPath).pipe(response);
};

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://localhost:${PORT}`);
    if (request.method === "GET" && url.pathname === "/") return sendText(response, 200, appHtml, "text/html; charset=utf-8");
    if (request.method === "GET" && url.pathname === "/api/state") return sendJson(response, 200, buildState());
    if (request.method === "POST" && url.pathname === "/api/add-missing") return sendJson(response, 200, { added: await addMissing(), state: buildState() });
    if (request.method === "POST" && url.pathname === "/api/regenerate") {
      const body = await readBody(request);
      return sendJson(response, 200, { updated: await regenerateMetadata(body.src), state: buildState() });
    }
    if (request.method === "POST" && url.pathname === "/api/remove-entry") {
      const body = await readBody(request);
      if (!body.src) throw new Error("Missing src.");
      return sendJson(response, 200, { removed: removeEntry(body.src), state: buildState() });
    }
    if (request.method === "POST" && url.pathname === "/api/move") {
      const body = await readBody(request);
      if (!body.src || !body.direction) throw new Error("Missing move data.");
      return sendJson(response, 200, { moved: moveEntry(body.src, body.direction), state: buildState() });
    }
    if (request.method === "POST" && url.pathname === "/api/scrub-sidecars") return sendJson(response, 200, { removed: scrubSidecars(), state: buildState() });
    if (request.method === "GET" && url.pathname.startsWith("/images/work/photography/")) return serveImage(request, response);
    sendText(response, 404, "Not found");
  } catch (error) {
    sendJson(response, 500, { error: error.message });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Photo Manager running at http://127.0.0.1:${PORT}/`);
  console.log("Press Ctrl-C to stop.");
});
