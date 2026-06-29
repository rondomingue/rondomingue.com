# rondomingue.com

Portfolio site for Ron Domingue — Art Director & Visual Artist.  
Built with [Eleventy](https://www.11ty.dev/), deployed to GitHub Pages.

---

## Stack

- **Eleventy 2.x** — static site generator
- **Nunjucks** — templating (`.njk`)
- **GitHub Pages** — hosting
- **GitHub Actions** — auto-build on push to `main`

---

## Local development

**Prerequisites:** Node.js 18+

```bash
npm install
npm start
```

Opens at `http://localhost:8080` with live reload.

---

## Project structure

```
src/
├── _includes/
│   ├── base.njk        ← base HTML layout (head, header, footer wrapping)
│   ├── header.njk      ← site header — edit once, applies everywhere
│   └── footer.njk      ← site footer — edit once, applies everywhere
├── _data/
│   ├── site.json       ← global config: name, email, social URLs, Vimeo ID
│   └── projects.json   ← work card data — add/remove projects here
├── css/
│   └── global.css      ← all styles, design tokens
├── images/
│   ├── misc/           ← emblem, portrait photo
│   └── work/           ← project thumbnail images
├── work/
│   └── index.njk       ← /work/ page (full project grid)
├── about.njk           ← /about/ page
└── index.njk           ← homepage (hero + work grid)
```

---

## Adding a project

Open `src/_data/projects.json` and add an entry:

```json
{
  "title": "Project Name",
  "slug": "project-name",
  "year": "2025",
  "tags": ["UE5", "Cinematic"],
  "thumb": "images/work/project-name.jpg",
  "vimeo": "VIMEO_ID_OR_YOUTUBE_ID"
}
```

Add the thumbnail to `src/images/work/`. Push. Done.

---

## Removing a project

Delete the entry from `projects.json`. Push.

---

## Deploying

Push to `main` — GitHub Actions builds automatically and deploys to GitHub Pages.

Manual build: `npm run build` → outputs to `_site/`

---

## DNS setup (Cloudflare)

Once you migrate to Cloudflare:

1. In GitHub repo → **Settings → Pages** → set custom domain to `rondomingue.com`
2. GitHub will create a `CNAME` file automatically
3. In Cloudflare DNS, add:
   - `A` records pointing to GitHub Pages IPs:
     ```
     185.199.108.153
     185.199.109.153
     185.199.110.153
     185.199.111.153
     ```
   - `CNAME` record: `www` → `[your-github-username].github.io`
4. Set Cloudflare proxy to **DNS only** (grey cloud) for the `A` records — GitHub Pages handles HTTPS

Field Guide stays at `guide.rondomingue.com` → GitHub Pages via CNAME (unchanged).

---

## Images needed

Place in `src/images/`:

```
misc/
  Thai-Emblem_white.png   ← logo emblem (already in Field Guide)
  ron-domingue.jpg        ← portrait photo for About page

work/
  ravens-isle.jpg
  desert-silence.jpg
  dark-star.jpg
  temple-of-the-sun.jpg
  haunted-swamp.jpg
  cold-warnings.jpg
```

Recommended thumb size: **1200 × 675px** (16:9), optimized JPG.
