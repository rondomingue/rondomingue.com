#!/usr/bin/env node

const fs = require("fs");
const http = require("http");
const path = require("path");
const { execFile } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.env.PHOTO_MANAGER_PORT || 4322);
const IMAGE_EXTENSIONS = new Set([".avif", ".jpg", ".jpeg", ".png", ".webp"]);

const COLLECTIONS = {
  photography: {
    label: "Photography",
    type: "gallery",
    dataFile: "src/_data/photographs.json",
    imageDir: "src/images/photography",
    altPrefix: "Photography by Ron Domingue"
  },
  illustration: {
    label: "Illustration",
    type: "gallery",
    dataFile: "src/_data/illustrations.json",
    imageDir: "src/images/illustration",
    preserveAlt: true
  },
  projects: {
    label: "Projects",
    type: "projects",
    dataFile: "src/_data/projects.json",
    imageDir: "src/images/work"
  }
};

const collectionFor = key => {
  const collection = COLLECTIONS[key || "photography"];
  if (!collection) throw new Error("Unknown collection.");
  return collection;
};

const absolute = relativePath => path.join(ROOT, relativePath);
const readJson = relativePath => JSON.parse(fs.readFileSync(absolute(relativePath), "utf8"));
const writeJson = (relativePath, data) => fs.writeFileSync(absolute(relativePath), `${JSON.stringify(data, null, 2)}\n`);
const isImageFile = fileName => IMAGE_EXTENSIONS.has(path.extname(fileName).toLowerCase());
const srcToTitle = src => path.basename(src, path.extname(src)).replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim().replace(/\b\w/g, letter => letter.toUpperCase());
const splitList = value => String(value || "").split(",").map(item => item.trim()).filter(Boolean);
const splitParagraphs = value => String(value || "").split(/\n{2,}/).map(item => item.trim()).filter(Boolean);
const slugFileName = value => String(value || "")
  .trim()
  .replace(/\.[^.]+$/, "")
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-zA-Z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .toLowerCase();

const sendJson = (response, status, body) => {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(body, null, 2));
};

const sendText = (response, status, text, contentType = "text/plain; charset=utf-8") => {
  response.writeHead(status, { "Content-Type": contentType, "Cache-Control": "no-store" });
  response.end(text);
};

const readBody = request => new Promise((resolve, reject) => {
  let body = "";
  request.on("data", chunk => {
    body += chunk;
    if (body.length > 2_000_000) {
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

const walkImages = relativeDir => {
  const start = absolute(relativeDir);
  if (!fs.existsSync(start)) return [];
  const results = [];
  const walk = directory => {
    for (const item of fs.readdirSync(directory)) {
      if (item.startsWith(".")) continue;
      const fullPath = path.join(directory, item);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) walk(fullPath);
      if (stat.isFile() && isImageFile(item)) results.push(path.relative(path.join(ROOT, "src"), fullPath).split(path.sep).join("/"));
    }
  };
  walk(start);
  return results.sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
};

const listSidecars = relativeDir => {
  const start = absolute(relativeDir);
  if (!fs.existsSync(start)) return [];
  const results = [];
  const walk = directory => {
    for (const item of fs.readdirSync(directory)) {
      const fullPath = path.join(directory, item);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) walk(fullPath);
      if (stat.isFile() && item.startsWith("._")) results.push(path.relative(ROOT, fullPath).split(path.sep).join("/"));
    }
  };
  walk(start);
  return results.sort();
};

const scrubSidecars = relativeDir => {
  let removed = 0;
  for (const sidecar of listSidecars(relativeDir)) {
    fs.unlinkSync(absolute(sidecar));
    removed += 1;
  }
  return removed;
};

const orientationFor = (width, height) => {
  if (Math.abs(width - height) < 80) return "square";
  return height > width ? "portrait" : "landscape";
};

const imageMetadata = src => new Promise(resolve => {
  execFile("sips", ["-g", "pixelWidth", "-g", "pixelHeight", absolute(`src/${src}`)], (error, stdout) => {
    if (error) return resolve({ width: 0, height: 0, orientation: "landscape" });
    const width = Number(stdout.match(/pixelWidth:\s*(\d+)/)?.[1] || 0);
    const height = Number(stdout.match(/pixelHeight:\s*(\d+)/)?.[1] || 0);
    resolve({ width, height, orientation: orientationFor(width, height) });
  });
});

const saveGallery = (collection, items) => {
  const normalized = items.map((item, index) => ({
    ...item,
    alt: collection.preserveAlt ? (item.alt || srcToTitle(item.src)) : `${collection.altPrefix} — ${index + 1}`
  }));
  writeJson(collection.dataFile, normalized);
  return normalized;
};

const buildGalleryState = (key, collection) => {
  const items = readJson(collection.dataFile);
  const files = walkImages(collection.imageDir);
  const fileSet = new Set(files);
  const itemSet = new Set(items.map(item => item.src));
  const seen = new Set();
  const duplicates = [];
  for (const item of items) {
    if (seen.has(item.src)) duplicates.push(item.src);
    seen.add(item.src);
  }
  return {
    key,
    label: collection.label,
    type: "gallery",
    count: {
      entries: items.length,
      files: files.length,
      missing: files.filter(src => !itemSet.has(src)).length,
      orphaned: items.filter(item => !fileSet.has(item.src)).length,
      sidecars: listSidecars(collection.imageDir).length,
      duplicates: duplicates.length
    },
    items: items.map((item, index) => ({ ...item, index, exists: fileSet.has(item.src), url: `/${item.src}` })),
    missing: files.filter(src => !itemSet.has(src)).map(src => ({ src, url: `/${src}` })),
    orphaned: items.filter(item => !fileSet.has(item.src)),
    duplicates
  };
};

const projectImageSrc = image => typeof image === "string" ? image : image.src;

const buildProjectsState = (key, collection) => {
  const projects = readJson(collection.dataFile);
  const files = walkImages(collection.imageDir).filter(src => !src.startsWith("images/photography/"));
  const fileSet = new Set(files);
  const used = new Set();
  const missing = [];
  for (const project of projects) {
    if (project.thumb) used.add(project.thumb);
    for (const image of project.images || []) {
      const src = projectImageSrc(image);
      if (src) used.add(src);
    }
  }
  for (const src of used) {
    if (!fileSet.has(src)) missing.push(src);
  }
  return {
    key,
    label: collection.label,
    type: "projects",
    count: {
      entries: projects.length,
      files: files.length,
      unused: files.filter(src => !used.has(src)).length,
      missing: missing.length,
      sidecars: listSidecars(collection.imageDir).length,
      duplicates: 0
    },
    projects: projects.map((project, index) => ({
      ...project,
      index,
      thumbExists: project.thumb ? fileSet.has(project.thumb) : false,
      thumbUrl: project.thumb ? `/${project.thumb}` : "",
      imageItems: (project.images || []).map((image, imageIndex) => {
        const src = projectImageSrc(image);
        return {
          src,
          alt: typeof image === "string" ? "" : image.alt || "",
          caption: typeof image === "string" ? "" : image.caption || "",
          index: imageIndex,
          exists: fileSet.has(src),
          url: `/${src}`
        };
      })
    })),
    files: files.map(src => ({ src, url: `/${src}`, used: used.has(src) })),
    missing
  };
};

const buildState = key => {
  const collection = collectionFor(key);
  return collection.type === "projects" ? buildProjectsState(key, collection) : buildGalleryState(key, collection);
};

const addMissingGallery = async key => {
  const collection = collectionFor(key);
  const items = readJson(collection.dataFile);
  const itemSet = new Set(items.map(item => item.src));
  const missing = walkImages(collection.imageDir).filter(src => !itemSet.has(src));
  const additions = [];
  for (const src of missing) additions.push({ src, alt: collection.preserveAlt ? srcToTitle(src) : "", ...(await imageMetadata(src)) });
  saveGallery(collection, [...items, ...additions]);
  return additions.length;
};

const regenerateGallery = async (key, targetSrc) => {
  const collection = collectionFor(key);
  const items = readJson(collection.dataFile);
  let updated = 0;
  for (const item of items) {
    if (targetSrc && item.src !== targetSrc) continue;
    if (!fs.existsSync(absolute(`src/${item.src}`))) continue;
    Object.assign(item, await imageMetadata(item.src));
    updated += 1;
  }
  saveGallery(collection, items);
  return updated;
};

const removeGalleryEntry = (key, src) => {
  const collection = collectionFor(key);
  const items = readJson(collection.dataFile);
  const nextItems = items.filter(item => item.src !== src);
  saveGallery(collection, nextItems);
  return items.length - nextItems.length;
};

const moveGalleryEntry = (key, src, direction) => {
  const collection = collectionFor(key);
  const items = readJson(collection.dataFile);
  const index = items.findIndex(item => item.src === src);
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || targetIndex < 0 || targetIndex >= items.length) return false;
  [items[index], items[targetIndex]] = [items[targetIndex], items[index]];
  saveGallery(collection, items);
  return true;
};

const saveGalleryItem = (key, src, metadata) => {
  const collection = collectionFor(key);
  const items = readJson(collection.dataFile);
  const item = items.find(entry => entry.src === src);
  if (!item) throw new Error("Gallery item not found.");

  if (collection.preserveAlt && "alt" in metadata) item.alt = String(metadata.alt || "").trim() || srcToTitle(src);
  if ("caption" in metadata) {
    const caption = String(metadata.caption || "").trim();
    if (caption) item.caption = caption;
    else delete item.caption;
  }

  saveGallery(collection, items);
  return true;
};

const saveProject = body => {
  const collection = collectionFor("projects");
  const projects = readJson(collection.dataFile);
  const project = projects.find(item => item.slug === body.slug);
  if (!project) throw new Error("Project not found.");
  for (const field of ["title", "slug", "year", "thumb", "summary", "format"]) {
    if (field in body.project) project[field] = body.project[field];
  }
  project.tags = splitList(body.project.tags);
  project.processTags = splitList(body.project.processTags);
  project.description = splitParagraphs(body.project.description);
  writeJson(collection.dataFile, projects);
  return true;
};

const moveProject = (slug, direction) => {
  const collection = collectionFor("projects");
  const projects = readJson(collection.dataFile);
  const index = projects.findIndex(project => project.slug === slug);
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || targetIndex < 0 || targetIndex >= projects.length) return false;
  [projects[index], projects[targetIndex]] = [projects[targetIndex], projects[index]];
  writeJson(collection.dataFile, projects);
  return true;
};

const addProjectImage = (slug, src) => {
  const collection = collectionFor("projects");
  const projects = readJson(collection.dataFile);
  const project = projects.find(item => item.slug === slug);
  if (!project) throw new Error("Project not found.");
  project.images = project.images || [];
  if (!project.images.some(image => projectImageSrc(image) === src)) project.images.push(src);
  writeJson(collection.dataFile, projects);
  return true;
};

const removeProjectImage = (slug, src) => {
  const collection = collectionFor("projects");
  const projects = readJson(collection.dataFile);
  const project = projects.find(item => item.slug === slug);
  if (!project) throw new Error("Project not found.");
  project.images = (project.images || []).filter(image => projectImageSrc(image) !== src);
  writeJson(collection.dataFile, projects);
  return true;
};

const replaceImageReference = (value, oldSrc, newSrc) => {
  if (typeof value === "string") return value === oldSrc ? newSrc : value;
  if (value && typeof value === "object" && value.src === oldSrc) return { ...value, src: newSrc };
  return value;
};

const renameImage = (oldSrc, requestedName) => {
  if (!oldSrc || !requestedName) throw new Error("Missing rename data.");
  if (!oldSrc.startsWith("images/")) throw new Error("Only local image paths can be renamed.");

  const oldFullPath = absolute("src/" + oldSrc);
  if (!fs.existsSync(oldFullPath)) throw new Error("Original file does not exist.");

  const extension = path.extname(oldSrc).toLowerCase();
  const currentBaseName = path.basename(oldSrc, extension);
  const safeBaseName = slugFileName(requestedName);
  if (!safeBaseName) throw new Error("Use at least one letter or number in the new name.");
  if (safeBaseName === slugFileName(currentBaseName)) return { oldSrc, newSrc: oldSrc, renamed: false, updatedReferences: 0 };

  const newSrc = path.dirname(oldSrc).split(path.sep).join("/") + "/" + safeBaseName + extension;
  const newFullPath = absolute("src/" + newSrc);
  if (fs.existsSync(newFullPath)) throw new Error("A file with that name already exists.");

  fs.renameSync(oldFullPath, newFullPath);

  let updatedReferences = 0;
  for (const collection of Object.values(COLLECTIONS)) {
    const data = readJson(collection.dataFile);
    if (collection.type === "gallery") {
      for (const item of data) {
        if (item.src === oldSrc) {
          item.src = newSrc;
          if (collection.preserveAlt) item.alt = item.alt || srcToTitle(newSrc);
          updatedReferences += 1;
        }
      }
      saveGallery(collection, data);
      continue;
    }

    for (const project of data) {
      if (project.thumb === oldSrc) {
        project.thumb = newSrc;
        updatedReferences += 1;
      }
      if (Array.isArray(project.images)) {
        project.images = project.images.map(image => {
          const nextImage = replaceImageReference(image, oldSrc, newSrc);
          if (nextImage !== image) updatedReferences += 1;
          return nextImage;
        });
      }
    }
    writeJson(collection.dataFile, data);
  }

  return { oldSrc, newSrc, renamed: true, updatedReferences };
};

const appHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Local Content Manager</title>
  <style>
    :root { --bg:#f6f3ef; --panel:#fff; --text:#191816; --muted:#68645f; --line:#ded8d0; --accent:#1b6c72; --danger:#9f2d20; --shadow:0 16px 40px rgba(31,27,21,.12); }
    * { box-sizing:border-box; }
    body { margin:0; font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; background:var(--bg); color:var(--text); }
    header { position:sticky; top:0; z-index:5; background:rgba(246,243,239,.94); border-bottom:1px solid var(--line); backdrop-filter:blur(18px); }
    .bar { display:grid; grid-template-columns:1fr auto; gap:16px; align-items:center; max-width:1480px; margin:0 auto; padding:16px 20px; }
    h1 { margin:0; font-size:22px; font-weight:760; letter-spacing:0; }
    .subtitle { margin-top:3px; color:var(--muted); font-size:13px; }
    .actions { display:flex; flex-wrap:wrap; gap:8px; justify-content:flex-end; }
    button,select,input,textarea { border:1px solid var(--line); border-radius:7px; background:var(--panel); color:var(--text); font:inherit; font-size:13px; }
    button,select { min-height:36px; padding:7px 11px; }
    input { min-height:36px; padding:7px 10px; }
    textarea { width:100%; min-height:82px; padding:8px 10px; resize:vertical; }
    button { cursor:pointer; box-shadow:0 1px 0 rgba(0,0,0,.04); }
    button:hover { border-color:#b8aea3; }
    button.primary { background:var(--accent); border-color:var(--accent); color:white; }
    button.danger { color:var(--danger); }
    main { max-width:1480px; margin:0 auto; padding:18px 20px 40px; }
    .stats { display:grid; grid-template-columns:repeat(6,minmax(110px,1fr)); gap:10px; margin-bottom:18px; }
    .stat { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:12px; }
    .stat strong { display:block; font-size:22px; line-height:1; margin-bottom:6px; }
    .stat span { color:var(--muted); font-size:12px; }
    .notice { display:none; margin:0 0 16px; border-radius:8px; padding:11px 12px; background:#fff8dc; border:1px solid #ead891; color:#5c4b04; font-size:13px; }
    .notice.active { display:block; }
    .toolbar { display:grid; grid-template-columns:1fr auto; gap:12px; align-items:center; margin-bottom:14px; }
    input[type="search"] { width:100%; background:white; font-size:14px; }
    .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:12px; }
    .projects-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(360px,1fr)); gap:14px; }
    .card { background:var(--panel); border:1px solid var(--line); border-radius:8px; overflow:hidden; box-shadow:0 1px 0 rgba(0,0,0,.03); }
    .card.missing-file { border-color:#d8a29a; }
    .thumb { aspect-ratio:4/3; background:#e5ded5; display:block; width:100%; object-fit:cover; }
    .meta { padding:12px; display:grid; gap:10px; }
    .name { font-size:13px; font-weight:680; overflow-wrap:anywhere; line-height:1.25; }
    .detail { color:var(--muted); font-size:12px; display:flex; flex-wrap:wrap; gap:6px; line-height:1.35; }
    .meta label { display:grid; gap:5px; color:var(--muted); font-size:12px; }
    .meta label input { width:100%; min-width:0; background:#fff; }
    .card-actions { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:6px; }
    .card-actions button,.card-actions select { min-height:32px; width:100%; padding:5px 7px; font-size:12px; }
    .card-actions .wide { grid-column:span 2; }
    .section-title { margin:24px 0 10px; font-size:16px; }
    .empty { padding:18px; background:var(--panel); border:1px solid var(--line); border-radius:8px; color:var(--muted); font-size:14px; }
    .project-form { padding:12px; display:grid; gap:10px; }
    .field-grid { display:grid; grid-template-columns:1fr 110px; gap:8px; }
    .project-form label { display:grid; gap:5px; color:var(--muted); font-size:12px; }
    .gallery-strip { display:grid; grid-template-columns:repeat(auto-fill,minmax(72px,1fr)); gap:6px; }
    .mini { position:relative; border:1px solid var(--line); border-radius:6px; overflow:hidden; background:#eee8df; }
    .mini img { display:block; width:100%; aspect-ratio:1; object-fit:cover; }
    .mini button { position:absolute; top:4px; right:4px; min-height:24px; padding:2px 6px; background:rgba(255,255,255,.9); }
    .toast { position:fixed; left:50%; bottom:18px; transform:translateX(-50%); min-width:min(480px,calc(100vw - 32px)); padding:12px 14px; border-radius:8px; background:#191816; color:white; box-shadow:var(--shadow); opacity:0; pointer-events:none; transition:opacity 160ms ease; font-size:14px; text-align:center; }
    .toast.active { opacity:1; }
    @media (max-width:820px) { .bar,.toolbar { grid-template-columns:1fr; } .actions { justify-content:stretch; } .actions button,.actions select { flex:1 1 auto; } .stats { grid-template-columns:repeat(2,1fr); } .projects-grid { grid-template-columns:1fr; } }
  </style>
</head>
<body>
  <header><div class="bar"><div><h1>Local Content Manager</h1><div class="subtitle">Edit photography, illustration, and projects JSON locally</div></div><div class="actions"><select id="collection"><option value="photography">Photography</option><option value="illustration">Illustration</option><option value="projects">Projects</option></select><button class="primary" id="addMissing">Add Missing</button><button id="regenAll">Regenerate Metadata</button><button id="scrubSidecars">Scrub Sidecars</button><button id="refresh">Refresh</button></div></div></header>
  <main><div class="stats" id="stats"></div><div class="notice" id="notice"></div><div class="toolbar"><input id="search" type="search" placeholder="Search"><select id="filter" aria-label="Filter"><option value="all">All</option><option value="portrait">Portrait</option><option value="landscape">Landscape</option><option value="square">Square</option><option value="missing-file">Missing file entries</option></select></div><section id="content"></section><section id="secondary"></section></main>
  <div class="toast" id="toast"></div>
  <script>
    const state = { data: null, collection: "photography", search: "", filter: "all" };
    const el = id => document.getElementById(id);
    const fileName = src => src.split("/").pop();
    const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" }[char]));
    const toast = message => { el("toast").textContent = message; el("toast").classList.add("active"); setTimeout(() => el("toast").classList.remove("active"), 1800); };
    const api = async (path, body) => {
      const response = await fetch(path, { method: body ? "POST" : "GET", headers: body ? { "Content-Type":"application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Request failed.");
      return data;
    };
    const refresh = async () => { state.data = await api("/api/state?collection=" + encodeURIComponent(state.collection)); render(); };
    const mutate = async (path, body, message) => { await api(path, { collection: state.collection, ...body }); await refresh(); toast(message); };
    const renderStats = () => {
      const count = state.data.count;
      const stats = state.data.type === "projects" ? [["Projects",count.entries],["Files",count.files],["Unused",count.unused],["Missing",count.missing],["Sidecars",count.sidecars],["Duplicates",count.duplicates]] : [["Entries",count.entries],["Files",count.files],["Missing",count.missing],["Orphaned",count.orphaned],["Sidecars",count.sidecars],["Duplicates",count.duplicates]];
      el("stats").innerHTML = stats.map(([label,value]) => '<div class="stat"><strong>' + value + '</strong><span>' + label + '</span></div>').join("");
      const warnings = [];
      if (count.missing) warnings.push(count.missing + " referenced or unlisted image issue(s).");
      if (count.orphaned) warnings.push(count.orphaned + " JSON entries point to missing files.");
      if (count.sidecars) warnings.push(count.sidecars + " macOS sidecar file(s) found.");
      if (count.duplicates) warnings.push(count.duplicates + " duplicate path(s) found.");
      el("notice").textContent = warnings.join(" ");
      el("notice").classList.toggle("active", warnings.length > 0);
    };
    const renderGallery = () => {
      const search = state.search.toLowerCase();
      const items = state.data.items.filter(item => {
        if (search && !(item.src + " " + item.alt).toLowerCase().includes(search)) return false;
        if (["portrait","landscape","square"].includes(state.filter)) return item.orientation === state.filter;
        if (state.filter === "missing-file") return !item.exists;
        return true;
      });
      el("content").innerHTML = '<div class="grid">' + items.map(item => '<article class="card ' + (item.exists ? "" : "missing-file") + '">' + (item.exists ? '<img class="thumb" src="' + item.url + '" alt="' + escapeHtml(item.alt) + '" loading="lazy">' : '<div class="thumb"></div>') + '<div class="meta"><div class="name">' + (item.index + 1) + '. ' + escapeHtml(fileName(item.src)) + '</div><div class="detail"><span>' + escapeHtml(item.caption || item.alt) + '</span><span>' + item.orientation + '</span><span>' + item.width + ' x ' + item.height + '</span></div><label><span>Caption</span><input name="caption" value="' + escapeHtml(item.caption || '') + '"></label>' + (state.collection === 'illustration' ? '<label><span>Alt text</span><input name="alt" value="' + escapeHtml(item.alt || '') + '"></label>' : '') + '<div class="card-actions"><button class="primary wide" data-action="save-gallery-item" data-src="' + escapeHtml(item.src) + '">Save Text</button><button data-action="up" data-src="' + escapeHtml(item.src) + '">Up</button><button data-action="down" data-src="' + escapeHtml(item.src) + '">Down</button><button data-action="regen" data-src="' + escapeHtml(item.src) + '">Meta</button><button data-action="rename-image" data-src="' + escapeHtml(item.src) + '">Rename</button><button class="danger" data-action="remove" data-src="' + escapeHtml(item.src) + '">Remove JSON</button></div></div></article>').join("") + "</div>";
      el("secondary").innerHTML = '<h2 class="section-title">Missing From JSON</h2>' + (state.data.missing.length ? '<div class="grid">' + state.data.missing.map(item => '<article class="card"><img class="thumb" src="' + item.url + '" alt="" loading="lazy"><div class="meta"><div class="name">' + escapeHtml(fileName(item.src)) + '</div></div></article>').join("") + '</div>' : '<div class="empty">No missing files. The folder and JSON match.</div>') + '<h2 class="section-title">Orphaned JSON Entries</h2>' + (state.data.orphaned.length ? '<div class="empty">' + state.data.orphaned.map(item => escapeHtml(item.src)).join("<br>") + '</div>' : '<div class="empty">No orphaned JSON entries.</div>');
    };
    const projectOptions = selected => state.data.files.map(file => '<option value="' + escapeHtml(file.src) + '"' + (file.src === selected ? " selected" : "") + '>' + escapeHtml(file.src) + '</option>').join("");
    const renderProjects = () => {
      const search = state.search.toLowerCase();
      const projects = state.data.projects.filter(project => !search || (project.title + " " + project.slug + " " + project.summary + " " + (project.tags || []).join(" ")).toLowerCase().includes(search));
      el("content").innerHTML = '<div class="projects-grid">' + projects.map(project => '<article class="card">' + (project.thumb ? '<img class="thumb" src="' + project.thumbUrl + '" alt="' + escapeHtml(project.title) + '" loading="lazy">' : '<div class="thumb"></div>') + '<form class="project-form" data-slug="' + escapeHtml(project.slug) + '"><div class="name">' + (project.index + 1) + '. ' + escapeHtml(project.title) + '</div><div class="field-grid"><label><span>Title</span><input name="title" value="' + escapeHtml(project.title) + '"></label><label><span>Year</span><input name="year" value="' + escapeHtml(project.year) + '"></label></div><label><span>Slug</span><input name="slug" value="' + escapeHtml(project.slug) + '"></label><label><span>Thumbnail</span><select name="thumb">' + projectOptions(project.thumb) + '</select></label><label><span>Summary</span><textarea name="summary">' + escapeHtml(project.summary || "") + '</textarea></label><label><span>Description</span><textarea name="description">' + escapeHtml((project.description || []).join("\\n\\n")) + '</textarea></label><label><span>Tags, comma separated</span><input name="tags" value="' + escapeHtml((project.tags || []).join(", ")) + '"></label><label><span>Process tags, comma separated</span><input name="processTags" value="' + escapeHtml((project.processTags || []).join(", ")) + '"></label><label><span>Format</span><input name="format" value="' + escapeHtml(project.format || "") + '"></label><div class="card-actions"><button class="primary" data-action="save-project" type="button">Save</button><button data-action="project-up" type="button">Up</button><button data-action="project-down" type="button">Down</button>' + (project.thumb ? '<button data-action="rename-image" data-src="' + escapeHtml(project.thumb) + '" type="button">Rename Thumb</button>' : '') + '</div><label><span>Add gallery image</span><select name="addImage"><option value="">Choose image</option>' + projectOptions("") + '</select></label><div class="card-actions"><button data-action="add-project-image" type="button">Add Image</button></div><div class="gallery-strip">' + project.imageItems.map(image => '<div class="mini"><img src="' + image.url + '" alt="" loading="lazy"><button data-action="rename-image" data-src="' + escapeHtml(image.src) + '" type="button">r</button><button class="danger" data-action="remove-project-image" data-src="' + escapeHtml(image.src) + '" type="button">x</button></div>').join("") + '</div></form></article>').join("") + "</div>";
      el("secondary").innerHTML = '<h2 class="section-title">Referenced Missing Files</h2>' + (state.data.missing.length ? '<div class="empty">' + state.data.missing.map(escapeHtml).join("<br>") + '</div>' : '<div class="empty">No missing project image references.</div>');
    };
    const render = () => { renderStats(); const isProjects = state.data.type === "projects"; el("addMissing").style.display = isProjects ? "none" : ""; el("regenAll").style.display = isProjects ? "none" : ""; el("filter").style.display = isProjects ? "none" : ""; if (isProjects) renderProjects(); else renderGallery(); };
    document.addEventListener("click", async event => {
      const button = event.target.closest("button"); if (!button) return;
      const action = button.dataset.action || button.id;
      const src = button.dataset.src;
      const form = button.closest("form");
      try {
        if (action === "refresh") await refresh();
        if (action === "addMissing") await mutate("/api/gallery/add-missing", {}, "Missing items added.");
        if (action === "regenAll") await mutate("/api/gallery/regenerate", {}, "Metadata regenerated.");
        if (action === "scrubSidecars") await mutate("/api/scrub-sidecars", {}, "Sidecars removed.");
        if (action === "up" || action === "down") await mutate("/api/gallery/move", { src, direction: action }, "Entry moved.");
        if (action === "regen") await mutate("/api/gallery/regenerate", { src }, "Metadata updated.");
        if (action === "rename-image") {
          const currentName = fileName(src).replace(/\.[^.]+$/, "");
          const newName = prompt("New filename. Extension is kept automatically.", currentName);
          if (newName) await mutate("/api/image/rename", { src, newName }, "Image renamed.");
        }
        if (action === "save-gallery-item") {
          const card = button.closest(".card");
          const metadata = {};
          card.querySelectorAll("input[name], textarea[name], select[name]").forEach(input => {
            metadata[input.name] = input.value;
          });
          await mutate("/api/gallery/save-item", { src, metadata }, "Text saved.");
        }
        if (action === "remove" && confirm("Remove this entry from JSON? The image file will stay in the folder.")) await mutate("/api/gallery/remove", { src }, "JSON entry removed.");
        if (action === "save-project") await mutate("/api/project/save", { slug: form.dataset.slug, project: Object.fromEntries(new FormData(form).entries()) }, "Project saved.");
        if (action === "project-up" || action === "project-down") await mutate("/api/project/move", { slug: form.dataset.slug, direction: action === "project-up" ? "up" : "down" }, "Project moved.");
        if (action === "add-project-image") { const imageSrc = new FormData(form).get("addImage"); if (imageSrc) await mutate("/api/project/add-image", { slug: form.dataset.slug, src: imageSrc }, "Project image added."); }
        if (action === "remove-project-image" && confirm("Remove this image from the project gallery? The file will stay on disk.")) await mutate("/api/project/remove-image", { slug: form.dataset.slug, src }, "Project image removed.");
      } catch (error) { toast(error.message); }
    });
    el("collection").addEventListener("change", event => { state.collection = event.target.value; state.search = ""; el("search").value = ""; refresh().catch(error => toast(error.message)); });
    el("search").addEventListener("input", event => { state.search = event.target.value; render(); });
    el("filter").addEventListener("change", event => { state.filter = event.target.value; render(); });
    refresh().catch(error => toast(error.message));
  </script>
</body>
</html>`;

const serveImage = (request, response) => {
  const decodedPath = decodeURIComponent(new URL(request.url, "http://localhost").pathname.replace(/^\/+/, ""));
  const fullPath = path.normalize(path.join(ROOT, "src", decodedPath));
  const allowedPath = path.join(ROOT, "src/images");
  if (!fullPath.startsWith(allowedPath) || !fs.existsSync(fullPath)) return sendText(response, fullPath.startsWith(allowedPath) ? 404 : 403, fullPath.startsWith(allowedPath) ? "Not found" : "Forbidden");
  const extension = path.extname(fullPath).toLowerCase();
  const contentTypes = { ".avif": "image/avif", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
  response.writeHead(200, { "Content-Type": contentTypes[extension] || "application/octet-stream", "Cache-Control": "no-store" });
  fs.createReadStream(fullPath).pipe(response);
};

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://localhost:${PORT}`);
    const collection = url.searchParams.get("collection") || "photography";
    if (request.method === "GET" && url.pathname === "/") return sendText(response, 200, appHtml, "text/html; charset=utf-8");
    if (request.method === "GET" && url.pathname === "/api/state") return sendJson(response, 200, buildState(collection));
    if (request.method === "GET" && url.pathname.startsWith("/images/")) return serveImage(request, response);
    if (request.method !== "POST") return sendText(response, 404, "Not found");
    const body = await readBody(request);
    const key = body.collection || "photography";
    if (url.pathname === "/api/gallery/add-missing") return sendJson(response, 200, { added: await addMissingGallery(key), state: buildState(key) });
    if (url.pathname === "/api/gallery/regenerate") return sendJson(response, 200, { updated: await regenerateGallery(key, body.src), state: buildState(key) });
    if (url.pathname === "/api/gallery/remove") return sendJson(response, 200, { removed: removeGalleryEntry(key, body.src), state: buildState(key) });
    if (url.pathname === "/api/gallery/move") return sendJson(response, 200, { moved: moveGalleryEntry(key, body.src, body.direction), state: buildState(key) });
    if (url.pathname === "/api/gallery/save-item") return sendJson(response, 200, { saved: saveGalleryItem(key, body.src, body.metadata || {}), state: buildState(key) });
    if (url.pathname === "/api/scrub-sidecars") return sendJson(response, 200, { removed: scrubSidecars(collectionFor(key).imageDir), state: buildState(key) });
    if (url.pathname === "/api/image/rename") return sendJson(response, 200, { rename: renameImage(body.src, body.newName), state: buildState(key) });
    if (url.pathname === "/api/project/save") return sendJson(response, 200, { saved: saveProject(body), state: buildState("projects") });
    if (url.pathname === "/api/project/move") return sendJson(response, 200, { moved: moveProject(body.slug, body.direction), state: buildState("projects") });
    if (url.pathname === "/api/project/add-image") return sendJson(response, 200, { added: addProjectImage(body.slug, body.src), state: buildState("projects") });
    if (url.pathname === "/api/project/remove-image") return sendJson(response, 200, { removed: removeProjectImage(body.slug, body.src), state: buildState("projects") });
    sendText(response, 404, "Not found");
  } catch (error) {
    sendJson(response, 500, { error: error.message });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Local Content Manager running at http://127.0.0.1:${PORT}/`);
  console.log("Press Ctrl-C to stop.");
});
