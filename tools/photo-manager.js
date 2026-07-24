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
    label: "Project Pages",
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

const applyGalleryMetadata = (collection, item, metadata) => {
  if (collection.preserveAlt && "alt" in metadata) item.alt = String(metadata.alt || "").trim() || srcToTitle(item.src);
  if ("caption" in metadata) {
    const caption = String(metadata.caption || "").trim();
    if (caption) item.caption = caption;
    else delete item.caption;
  }
};

const saveGalleryItem = (key, src, metadata) => {
  const collection = collectionFor(key);
  const items = readJson(collection.dataFile);
  const item = items.find(entry => entry.src === src);
  if (!item) throw new Error("Gallery item not found.");

  applyGalleryMetadata(collection, item, metadata);
  saveGallery(collection, items);
  return true;
};

const saveGalleryItems = (key, updates) => {
  if (!Array.isArray(updates)) throw new Error("Bulk updates must be an array.");
  const collection = collectionFor(key);
  const items = readJson(collection.dataFile);
  const itemBySrc = new Map(items.map(item => [item.src, item]));
  let saved = 0;

  for (const update of updates) {
    const item = itemBySrc.get(update.src);
    if (!item) continue;
    applyGalleryMetadata(collection, item, update.metadata || {});
    saved += 1;
  }

  saveGallery(collection, items);
  return saved;
};

const applyProjectFields = (project, fields) => {
  for (const field of ["title", "slug", "year", "thumb", "summary", "format"]) {
    if (field in fields) project[field] = fields[field];
  }
  project.tags = splitList(fields.tags);
  project.processTags = splitList(fields.processTags);
  project.description = splitParagraphs(fields.description);
};

const saveProject = body => {
  const collection = collectionFor("projects");
  const projects = readJson(collection.dataFile);
  const project = projects.find(item => item.slug === body.slug);
  if (!project) throw new Error("Project not found.");
  applyProjectFields(project, body.project || {});
  writeJson(collection.dataFile, projects);
  return true;
};

const saveProjects = updates => {
  if (!Array.isArray(updates)) throw new Error("Bulk project updates must be an array.");
  const collection = collectionFor("projects");
  const projects = readJson(collection.dataFile);
  const projectBySlug = new Map(projects.map(project => [project.slug, project]));
  let saved = 0;

  for (const update of updates) {
    const project = projectBySlug.get(update.slug);
    if (!project) continue;
    applyProjectFields(project, update.project || {});
    saved += 1;
  }

  writeJson(collection.dataFile, projects);
  return saved;
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

const moveProjectImage = (slug, src, direction) => {
  const collection = collectionFor("projects");
  const projects = readJson(collection.dataFile);
  const project = projects.find(item => item.slug === slug);
  if (!project) throw new Error("Project not found.");
  project.images = project.images || [];
  const index = project.images.findIndex(image => projectImageSrc(image) === src);
  const targetIndex = direction === "left" ? index - 1 : index + 1;
  if (index < 0 || targetIndex < 0 || targetIndex >= project.images.length) return false;
  [project.images[index], project.images[targetIndex]] = [project.images[targetIndex], project.images[index]];
  writeJson(collection.dataFile, projects);
  return true;
};

const reorderProjectImages = (slug, order) => {
  if (!Array.isArray(order)) throw new Error("Project image order must be an array.");
  const collection = collectionFor("projects");
  const projects = readJson(collection.dataFile);
  const project = projects.find(item => item.slug === slug);
  if (!project) throw new Error("Project not found.");
  const images = project.images || [];
  const imageBySrc = new Map(images.map(image => [projectImageSrc(image), image]));
  const seen = new Set();
  const nextImages = [];

  for (const src of order) {
    if (!imageBySrc.has(src) || seen.has(src)) continue;
    nextImages.push(imageBySrc.get(src));
    seen.add(src);
  }
  for (const image of images) {
    const src = projectImageSrc(image);
    if (!seen.has(src)) nextImages.push(image);
  }

  project.images = nextImages;
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
    :root {
      --bg:#07080a;
      --panel:#101115;
      --panel-2:#15171c;
      --text:#eeeef0;
      --dim:rgba(238,238,240,.64);
      --muted:rgba(238,238,240,.42);
      --line:rgba(238,238,240,.12);
      --line-strong:rgba(238,238,240,.2);
      --accent:#c8289a;
      --accent-soft:rgba(200,40,154,.13);
      --cyan:#4fc8e8;
      --danger:#ff6b5e;
      --warn:#e0b84a;
      --shadow:0 18px 70px rgba(0,0,0,.36);
    }
    * { box-sizing:border-box; }
    body {
      margin:0;
      font-family:"din-2014",Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      background:
        radial-gradient(circle at 18% -8%, rgba(200,40,154,.16), transparent 34%),
        radial-gradient(circle at 88% 8%, rgba(79,200,232,.08), transparent 30%),
        var(--bg);
      color:var(--text);
    }
    header {
      position:sticky;
      top:0;
      z-index:5;
      background:rgba(7,8,10,.82);
      border-bottom:1px solid var(--line);
      backdrop-filter:blur(18px);
      -webkit-backdrop-filter:blur(18px);
    }
    .bar { display:grid; grid-template-columns:1fr auto; gap:18px; align-items:center; max-width:1480px; margin:0 auto; padding:18px 22px; }
    h1 { margin:0; font-size:13px; font-weight:400; letter-spacing:.22em; text-transform:uppercase; }
    .subtitle { margin-top:7px; color:var(--muted); font-family:"Space Mono",ui-monospace,monospace; font-size:10px; letter-spacing:.08em; text-transform:uppercase; }
    .actions { display:flex; flex-wrap:wrap; gap:8px; justify-content:flex-end; }
    button,select,input,textarea {
      border:1px solid var(--line);
      border-radius:6px;
      background:rgba(255,255,255,.03);
      color:var(--text);
      font:inherit;
      font-size:12px;
    }
    button,select { min-height:38px; padding:8px 12px; }
    input { min-height:38px; padding:8px 11px; }
    textarea { width:100%; min-height:86px; padding:9px 11px; resize:vertical; }
    input,select,textarea { min-width:0; }
    input::placeholder { color:rgba(238,238,240,.28); }
    button { cursor:pointer; box-shadow:none; transition:border-color .18s ease, background .18s ease, color .18s ease, transform .18s ease; }
    button:hover { border-color:rgba(200,40,154,.48); background:rgba(200,40,154,.09); color:var(--text); }
    button:active { transform:translateY(1px); }
    button.primary { background:rgba(200,40,154,.18); border-color:rgba(200,40,154,.5); color:var(--text); }
    button.danger { color:var(--danger); border-color:rgba(255,107,94,.22); }
    button.danger:hover { background:rgba(255,107,94,.1); border-color:rgba(255,107,94,.46); }
    select { color:var(--dim); }
    main { max-width:1480px; margin:0 auto; padding:20px 22px 56px; }
    .stats { display:grid; grid-template-columns:repeat(6,minmax(110px,1fr)); gap:10px; margin-bottom:18px; }
    .stat { background:linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,.02)); border:1px solid var(--line); border-radius:6px; padding:13px; }
    .stat strong { display:block; color:var(--text); font-size:24px; line-height:1; margin-bottom:8px; font-weight:300; letter-spacing:.03em; }
    .stat span { color:var(--muted); font-family:"Space Mono",ui-monospace,monospace; font-size:9px; letter-spacing:.14em; text-transform:uppercase; }
    .notice { display:none; margin:0 0 16px; border-radius:6px; padding:11px 12px; background:rgba(224,184,74,.1); border:1px solid rgba(224,184,74,.34); color:#e7c86a; font-family:"Space Mono",ui-monospace,monospace; font-size:10px; letter-spacing:.08em; text-transform:uppercase; }
    .notice.active { display:block; }
    .toolbar { display:grid; grid-template-columns:1fr 160px; gap:12px; align-items:center; margin-bottom:14px; }
    .pager { display:flex; align-items:center; justify-content:space-between; gap:12px; margin:0 0 18px; padding:10px 12px; border:1px solid var(--line); border-radius:6px; background:rgba(255,255,255,.025); }
    .pager-group { display:flex; align-items:center; gap:8px; }
    .pager-info { color:var(--muted); font-family:"Space Mono",ui-monospace,monospace; font-size:9px; letter-spacing:.12em; text-transform:uppercase; }
    .pager button[disabled] { opacity:.35; cursor:not-allowed; transform:none; }
    input[type="search"] { width:100%; background:rgba(255,255,255,.035); font-size:13px; }
    .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:14px; }
    .projects-grid { display:grid; grid-template-columns:minmax(0, 1fr); gap:22px; align-items:start; max-width:1180px; margin:0 auto; }
    .card { background:rgba(16,17,21,.94); border:1px solid var(--line); border-radius:6px; overflow:hidden; box-shadow:0 1px 0 rgba(255,255,255,.03); transition:border-color .2s ease, transform .2s ease, box-shadow .2s ease; }
    .project-card { display:block; }
    .project-cover { position:relative; background:#090a0c; border-bottom:1px solid var(--line); }
    .project-cover .thumb { aspect-ratio:16/9; height:auto; max-height:420px; object-fit:cover; object-position:center; }
    .project-cover-badge { position:absolute; left:12px; bottom:12px; max-width:calc(100% - 24px); padding:7px 9px; border:1px solid rgba(200,40,154,.34); border-radius:999px; background:rgba(7,8,10,.72); color:var(--dim); font-family:"Space Mono",ui-monospace,monospace; font-size:8px; letter-spacing:.12em; text-transform:uppercase; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .card:hover { border-color:rgba(200,40,154,.34); transform:translateY(-2px); box-shadow:0 18px 44px rgba(0,0,0,.28); }
    .card.missing-file { border-color:rgba(255,107,94,.55); }
    .thumb { aspect-ratio:4/3; background:#090a0c; display:block; width:100%; object-fit:cover; filter:saturate(.88) contrast(1.04); }
    .meta { padding:12px; display:grid; gap:10px; }
    .name { font-size:12px; font-weight:500; overflow-wrap:anywhere; line-height:1.3; letter-spacing:.02em; }
    .detail { color:var(--muted); font-family:"Space Mono",ui-monospace,monospace; font-size:9px; display:flex; flex-wrap:wrap; gap:7px; line-height:1.45; text-transform:uppercase; letter-spacing:.06em; }
    .meta label { display:grid; gap:6px; color:var(--muted); font-family:"Space Mono",ui-monospace,monospace; font-size:9px; letter-spacing:.12em; text-transform:uppercase; }
    .meta label input { width:100%; min-width:0; background:rgba(255,255,255,.035); }
    .card-actions { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:7px; }
    .card-actions button,.card-actions select { min-height:32px; width:100%; padding:5px 7px; font-size:11px; }
    .card-actions .wide { grid-column:span 2; }
    .section-title { margin:26px 0 12px; font-size:12px; font-weight:400; letter-spacing:.18em; text-transform:uppercase; color:var(--dim); }
    .empty { padding:18px; background:var(--panel); border:1px solid var(--line); border-radius:6px; color:var(--muted); font-size:13px; }
    .project-form { padding:14px; display:grid; gap:10px; }
    .field-grid { display:grid; grid-template-columns:minmax(0,1fr) 150px; gap:12px; }
    .project-form label { display:grid; gap:6px; min-width:0; color:var(--muted); font-family:"Space Mono",ui-monospace,monospace; font-size:9px; letter-spacing:.12em; text-transform:uppercase; }
    .project-form input,.project-form select,.project-form textarea { width:100%; }
    .gallery-strip { display:flex; flex-wrap:wrap; gap:8px; max-height:228px; overflow:auto; padding:2px 2px 2px 0; align-items:flex-start; }
    .mini { position:relative; flex:0 0 96px; border:1px solid var(--line); border-radius:5px; overflow:visible; background:#090a0c; cursor:grab; transition:transform .18s ease, opacity .18s ease, border-color .18s ease; }
    .mini:active { cursor:grabbing; }
    .mini.is-dragging { opacity:.38; border-color:rgba(200,40,154,.8); transform:scale(.96); }
    .drop-slot { flex:0 0 0; align-self:stretch; min-height:96px; border-radius:5px; background:rgba(200,40,154,.2); box-shadow:0 0 0 1px rgba(200,40,154,.55), 0 0 24px rgba(200,40,154,.28); transition:flex-basis .16s ease, opacity .16s ease; opacity:0; pointer-events:none; }
    .drop-slot.is-active { flex-basis:18px; opacity:1; }
    .mini img { display:block; width:100%; aspect-ratio:1; object-fit:cover; border-radius:5px; }
    .mini-remove { position:absolute; z-index:5; top:4px; right:4px; width:20px; height:20px; min-height:20px; padding:0; border-radius:999px; background:rgba(7,8,10,.76); color:var(--danger); font-size:12px; line-height:1; }
    .mini-tools { position:absolute; z-index:4; left:50%; bottom:8px; display:flex; gap:5px; padding:4px; border:1px solid rgba(238,238,240,.16); border-radius:999px; background:rgba(7,8,10,.86); box-shadow:0 10px 28px rgba(0,0,0,.38); opacity:0; transform:translate(-50%, 8px); transition:opacity .18s ease, transform .18s ease; }
    .mini:hover .mini-tools, .mini:focus-within .mini-tools { opacity:1; transform:translate(-50%, 0); }
    .mini-tools button { position:static; min-height:20px; padding:2px 7px; border-radius:999px; background:rgba(255,255,255,.04); font-size:8px; letter-spacing:.08em; }
    .mini-tools .mini-hero { border-color:rgba(200,40,154,.42); background:rgba(200,40,154,.2); }
    .mini.is-current-thumb { border-color:rgba(200,40,154,.74); box-shadow:0 0 0 1px rgba(200,40,154,.22), 0 0 24px rgba(200,40,154,.22); }
    .toast { position:fixed; left:50%; bottom:18px; transform:translateX(-50%); min-width:min(480px,calc(100vw - 32px)); padding:12px 14px; border-radius:6px; background:rgba(16,17,21,.94); border:1px solid rgba(200,40,154,.35); color:var(--text); box-shadow:var(--shadow); opacity:0; pointer-events:none; transition:opacity 160ms ease; font-size:13px; text-align:center; }
    .toast.active { opacity:1; }
    @media (max-width:980px) { .project-cover .thumb { max-height:320px; } }
    @media (max-width:820px) { .bar,.toolbar { grid-template-columns:1fr; } .field-grid { grid-template-columns:1fr; } .pager { align-items:stretch; flex-direction:column; } .pager-group { justify-content:space-between; } .actions { justify-content:stretch; } .actions button,.actions select { flex:1 1 auto; } .stats { grid-template-columns:repeat(2,1fr); } .projects-grid { grid-template-columns:1fr; } }
  </style>
</head>
<body>
  <header><div class="bar"><div><h1>Local Content Manager</h1><div class="subtitle">Edit photography, illustration, and projects JSON locally</div></div><div class="actions"><select id="collection"><option value="photography">Photography</option><option value="illustration">Illustration</option><option value="projects">Project Pages</option></select><button class="primary" id="addMissing">Add Missing</button><button class="primary" id="saveVisibleText">Save All Text</button><button class="primary" id="saveVisibleProjects">Save All Projects</button><button id="regenAll">Regenerate Metadata</button><button id="scrubSidecars">Scrub Sidecars</button><button id="refresh">Refresh</button></div></div></header>
  <main><div class="stats" id="stats"></div><div class="notice" id="notice"></div><div class="toolbar"><input id="search" type="search" placeholder="Search"><select id="filter" aria-label="Filter"><option value="all">All</option><option value="portrait">Portrait</option><option value="landscape">Landscape</option><option value="square">Square</option><option value="missing-file">Missing file entries</option></select></div><div class="pager" id="pager"><div class="pager-group"><button id="pagePrev" type="button">Prev</button><button id="pageNext" type="button">Next</button><span class="pager-info" id="pageInfo"></span></div><div class="pager-group"><span class="pager-info">Per page</span><select id="pageSize" aria-label="Items per page"><option value="2">2</option><option value="4">4</option><option value="8">8</option><option value="16">16</option><option value="24" selected>24</option><option value="48">48</option></select></div></div><section id="content"></section><section id="secondary"></section></main>
  <div class="toast" id="toast"></div>
  <script>
    const state = { data: null, collection: "photography", search: "", filter: "all", page: 1, pageSize: 24 };
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
    const paginate = items => {
      const pageSize = Number(state.pageSize) || 24;
      const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
      state.page = Math.min(Math.max(1, state.page), totalPages);
      const start = (state.page - 1) * pageSize;
      return { items: items.slice(start, start + pageSize), total: items.length, totalPages, start };
    };
    const renderPager = ({ total, totalPages, start, items }) => {
      el("pager").hidden = total === 0;
      el("pageInfo").textContent = total ? (start + 1) + "-" + (start + items.length) + " of " + total + " / page " + state.page + " of " + totalPages : "0 items";
      el("pagePrev").disabled = state.page <= 1;
      el("pageNext").disabled = state.page >= totalPages;
      el("pageSize").value = String(state.pageSize);
    };
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
      const filteredItems = state.data.items.filter(item => {
        if (search && !(item.src + " " + item.alt).toLowerCase().includes(search)) return false;
        if (["portrait","landscape","square"].includes(state.filter)) return item.orientation === state.filter;
        if (state.filter === "missing-file") return !item.exists;
        return true;
      });
      const page = paginate(filteredItems);
      renderPager(page);
      el("content").innerHTML = '<div class="grid">' + page.items.map(item => '<article class="card ' + (item.exists ? "" : "missing-file") + '">' + (item.exists ? '<img class="thumb" src="' + item.url + '" alt="' + escapeHtml(item.alt) + '" loading="lazy">' : '<div class="thumb"></div>') + '<div class="meta"><div class="name">' + (item.index + 1) + '. ' + escapeHtml(fileName(item.src)) + '</div><div class="detail"><span>' + escapeHtml(item.caption || item.alt) + '</span><span>' + item.orientation + '</span><span>' + item.width + ' x ' + item.height + '</span></div><label><span>Caption</span><input name="caption" value="' + escapeHtml(item.caption || '') + '"></label>' + (state.collection === 'illustration' ? '<label><span>Alt text</span><input name="alt" value="' + escapeHtml(item.alt || '') + '"></label>' : '') + '<div class="card-actions"><button class="primary wide" data-action="save-gallery-item" data-src="' + escapeHtml(item.src) + '">Save Text</button><button data-action="up" data-src="' + escapeHtml(item.src) + '">Up</button><button data-action="down" data-src="' + escapeHtml(item.src) + '">Down</button><button data-action="regen" data-src="' + escapeHtml(item.src) + '">Meta</button><button data-action="rename-image" data-src="' + escapeHtml(item.src) + '">Rename</button><button class="danger" data-action="remove" data-src="' + escapeHtml(item.src) + '">Remove JSON</button></div></div></article>').join("") + "</div>";
      el("secondary").innerHTML = '<h2 class="section-title">Missing From JSON</h2>' + (state.data.missing.length ? '<div class="grid">' + state.data.missing.map(item => '<article class="card"><img class="thumb" src="' + item.url + '" alt="" loading="lazy"><div class="meta"><div class="name">' + escapeHtml(fileName(item.src)) + '</div></div></article>').join("") + '</div>' : '<div class="empty">No missing files. The folder and JSON match.</div>') + '<h2 class="section-title">Orphaned JSON Entries</h2>' + (state.data.orphaned.length ? '<div class="empty">' + state.data.orphaned.map(item => escapeHtml(item.src)).join("<br>") + '</div>' : '<div class="empty">No orphaned JSON entries.</div>');
    };
    const projectOptions = selected => state.data.files.map(file => '<option value="' + escapeHtml(file.src) + '"' + (file.src === selected ? " selected" : "") + '>' + escapeHtml(file.src) + '</option>').join("");
    const renderProjects = () => {
      const search = state.search.toLowerCase();
      const filteredProjects = state.data.projects.filter(project => !search || (project.title + " " + project.slug + " " + project.summary + " " + (project.tags || []).join(" ")).toLowerCase().includes(search));
      const page = paginate(filteredProjects);
      renderPager(page);
      el("content").innerHTML = '<div class="projects-grid">' + page.items.map(project => {
        const currentThumb = project.thumb || "";
        const cover = currentThumb ? '<img class="thumb project-thumb-preview" src="' + project.thumbUrl + '" alt="' + escapeHtml(project.title) + '" loading="lazy">' : '<div class="thumb project-thumb-preview"></div>';
        return '<article class="card project-card"><div class="project-cover">' + cover + '<div class="project-cover-badge">Hero image</div></div><form class="project-form" data-slug="' + escapeHtml(project.slug) + '"><div class="name">' + (project.index + 1) + '. ' + escapeHtml(project.title) + '</div><div class="field-grid"><label><span>Title</span><input name="title" value="' + escapeHtml(project.title) + '"></label><label><span>Year</span><input name="year" value="' + escapeHtml(project.year) + '"></label></div><label><span>Slug</span><input name="slug" value="' + escapeHtml(project.slug) + '"></label><label><span>Hero image</span><select name="thumb">' + projectOptions(currentThumb) + '</select></label><label><span>Summary</span><textarea name="summary">' + escapeHtml(project.summary || "") + '</textarea></label><label><span>Description</span><textarea name="description">' + escapeHtml((project.description || []).join("\\n\\n")) + '</textarea></label><label><span>Tags, comma separated</span><input name="tags" value="' + escapeHtml((project.tags || []).join(", ")) + '"></label><label><span>Process tags, comma separated</span><input name="processTags" value="' + escapeHtml((project.processTags || []).join(", ")) + '"></label><label><span>Format</span><input name="format" value="' + escapeHtml(project.format || "") + '"></label><div class="card-actions"><button class="primary" data-action="save-project" type="button">Save</button><button data-action="project-up" type="button">Up</button><button data-action="project-down" type="button">Down</button>' + (currentThumb ? '<button data-action="rename-image" data-src="' + escapeHtml(currentThumb) + '" type="button">Rename Hero</button>' : '') + '</div><label><span>Add gallery image</span><select name="addImage"><option value="">Choose image</option>' + projectOptions("") + '</select></label><div class="card-actions"><button data-action="add-project-image" type="button">Add Image</button></div><div class="gallery-strip">' + project.imageItems.map(image => '<div class="mini ' + (image.src === currentThumb ? 'is-current-thumb' : '') + '" draggable="true" data-src="' + escapeHtml(image.src) + '"><img src="' + image.url + '" alt="" loading="lazy"><button class="danger mini-remove" data-action="remove-project-image" data-src="' + escapeHtml(image.src) + '" title="Remove from gallery" type="button">&times;</button><div class="mini-tools"><button class="mini-rename" data-action="rename-image" data-src="' + escapeHtml(image.src) + '" title="Rename image" type="button">Rename</button><button class="mini-hero" data-action="set-project-thumb" data-src="' + escapeHtml(image.src) + '" title="Use as hero image" type="button">Hero</button></div></div>').join("") + '</div></form></article>';
      }).join("") + "</div>";
      el("secondary").innerHTML = '<h2 class="section-title">Referenced Missing Files</h2>' + (state.data.missing.length ? '<div class="empty">' + state.data.missing.map(escapeHtml).join("<br>") + '</div>' : '<div class="empty">No missing project image references.</div>');
    };
    const render = () => { renderStats(); const isProjects = state.data.type === "projects"; el("addMissing").style.display = isProjects ? "none" : ""; el("saveVisibleText").style.display = isProjects ? "none" : ""; el("saveVisibleProjects").style.display = isProjects ? "" : "none"; el("regenAll").style.display = isProjects ? "none" : ""; el("filter").style.display = isProjects ? "none" : ""; if (isProjects) renderProjects(); else renderGallery(); };
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
        if (action === "saveVisibleText") {
          const updates = [...document.querySelectorAll("#content .card")].map(card => {
            const saveButton = card.querySelector('[data-action="save-gallery-item"]');
            if (!saveButton) return null;
            const metadata = {};
            card.querySelectorAll("input[name], textarea[name], select[name]").forEach(input => {
              metadata[input.name] = input.value;
            });
            return { src: saveButton.dataset.src, metadata };
          }).filter(Boolean);
          if (updates.length) await mutate("/api/gallery/save-items", { updates }, updates.length + " visible text item(s) saved.");
          else toast("No visible text fields to save.");
        }
        if (action === "remove" && confirm("Remove this entry from JSON? The image file will stay in the folder.")) await mutate("/api/gallery/remove", { src }, "JSON entry removed.");
        if (action === "set-project-thumb") {
          const thumbSelect = form.querySelector('[name="thumb"]');
          if (thumbSelect) thumbSelect.value = src;
          await mutate("/api/project/save", { slug: form.dataset.slug, project: Object.fromEntries(new FormData(form).entries()) }, "Project hero updated.");
        }
        if (action === "save-project") await mutate("/api/project/save", { slug: form.dataset.slug, project: Object.fromEntries(new FormData(form).entries()) }, "Project saved.");
        if (action === "saveVisibleProjects") {
          const updates = [...document.querySelectorAll("#content .project-form")].map(projectForm => ({
            slug: projectForm.dataset.slug,
            project: Object.fromEntries(new FormData(projectForm).entries())
          }));
          if (updates.length) await mutate("/api/project/save-items", { updates }, updates.length + " visible project page(s) saved.");
          else toast("No visible project pages to save.");
        }
        if (action === "project-up" || action === "project-down") await mutate("/api/project/move", { slug: form.dataset.slug, direction: action === "project-up" ? "up" : "down" }, "Project moved.");
        if (action === "add-project-image") { const imageSrc = new FormData(form).get("addImage"); if (imageSrc) await mutate("/api/project/add-image", { slug: form.dataset.slug, src: imageSrc }, "Project image added."); }
        if (action === "remove-project-image" && confirm("Remove this image from the project gallery? The file will stay on disk.")) await mutate("/api/project/remove-image", { slug: form.dataset.slug, src }, "Project image removed.");
      } catch (error) { toast(error.message); }
    });
    let draggedMini = null;
    let dropSlot = null;
    const removeDropSlot = () => {
      if (dropSlot) dropSlot.remove();
      dropSlot = null;
    };
    const placeDropSlot = (targetMini, clientX) => {
      if (!targetMini || !draggedMini || targetMini === draggedMini) return;
      if (targetMini.closest(".project-form") !== draggedMini.closest(".project-form")) return;
      const rect = targetMini.getBoundingClientRect();
      const placeAfter = clientX > rect.left + rect.width / 2;
      if (!dropSlot) {
        dropSlot = document.createElement("div");
        dropSlot.className = "drop-slot";
      }
      if (placeAfter) targetMini.after(dropSlot);
      else targetMini.before(dropSlot);
      requestAnimationFrame(() => dropSlot?.classList.add("is-active"));
    };
    document.addEventListener("dragstart", event => {
      const mini = event.target.closest(".mini[draggable='true']");
      if (!mini) return;
      draggedMini = mini;
      mini.classList.add("is-dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", mini.dataset.src || "");
    });
    document.addEventListener("dragover", event => {
      const mini = event.target.closest(".mini[draggable='true']");
      if (!mini || !draggedMini || mini === draggedMini) return;
      if (mini.closest(".project-form") !== draggedMini.closest(".project-form")) return;
      event.preventDefault();
      placeDropSlot(mini, event.clientX);
    });
    document.addEventListener("drop", async event => {
      if (!draggedMini || !dropSlot) return;
      const strip = dropSlot.closest(".gallery-strip");
      const form = strip?.closest(".project-form");
      if (!strip || !form) return;
      event.preventDefault();

      dropSlot.replaceWith(draggedMini);
      dropSlot = null;
      const order = [...strip.querySelectorAll(".mini[draggable='true']")].map(mini => mini.dataset.src);
      draggedMini.classList.remove("is-dragging");
      try {
        await mutate("/api/project/reorder-images", { slug: form.dataset.slug, order }, "Gallery image order updated.");
      } catch (error) {
        toast(error.message);
      }
    });
    document.addEventListener("dragend", () => {
      document.querySelectorAll(".mini").forEach(mini => mini.classList.remove("is-dragging"));
      removeDropSlot();
      draggedMini = null;
    });

    el("collection").addEventListener("change", event => {
      state.collection = event.target.value;
      state.search = "";
      state.filter = "all";
      state.page = 1;
      state.pageSize = state.collection === "projects" ? 2 : 24;
      el("search").value = "";
      el("filter").value = "all";
      refresh().catch(error => toast(error.message));
    });
    el("search").addEventListener("input", event => { state.search = event.target.value; state.page = 1; render(); });
    el("filter").addEventListener("change", event => { state.filter = event.target.value; state.page = 1; render(); });
    el("pageSize").addEventListener("change", event => { state.pageSize = Number(event.target.value); state.page = 1; render(); });
    el("pagePrev").addEventListener("click", () => { state.page -= 1; render(); window.scrollTo({ top: 0, behavior: "smooth" }); });
    el("pageNext").addEventListener("click", () => { state.page += 1; render(); window.scrollTo({ top: 0, behavior: "smooth" }); });
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
    if (url.pathname === "/api/gallery/save-items") return sendJson(response, 200, { saved: saveGalleryItems(key, body.updates || []), state: buildState(key) });
    if (url.pathname === "/api/scrub-sidecars") return sendJson(response, 200, { removed: scrubSidecars(collectionFor(key).imageDir), state: buildState(key) });
    if (url.pathname === "/api/image/rename") return sendJson(response, 200, { rename: renameImage(body.src, body.newName), state: buildState(key) });
    if (url.pathname === "/api/project/save") return sendJson(response, 200, { saved: saveProject(body), state: buildState("projects") });
    if (url.pathname === "/api/project/save-items") return sendJson(response, 200, { saved: saveProjects(body.updates || []), state: buildState("projects") });
    if (url.pathname === "/api/project/move") return sendJson(response, 200, { moved: moveProject(body.slug, body.direction), state: buildState("projects") });
    if (url.pathname === "/api/project/add-image") return sendJson(response, 200, { added: addProjectImage(body.slug, body.src), state: buildState("projects") });
    if (url.pathname === "/api/project/move-image") return sendJson(response, 200, { moved: moveProjectImage(body.slug, body.src, body.direction), state: buildState("projects") });
    if (url.pathname === "/api/project/reorder-images") return sendJson(response, 200, { reordered: reorderProjectImages(body.slug, body.order || []), state: buildState("projects") });
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
