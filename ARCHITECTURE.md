# Martin Dashboard — Architecture (MVP)

**Owner:** Make It Real Martin  
**Consumer:** Michael Hearn  
**Modules v1:** Systems Training (GregInThebox), Marketplace (MarketPlaceMaggie)  
**Principle:** systems not demos; structured data over chat; one URL command center.

---

## 1. Goal

Smallest working loop:

```
Specialist Bot → structured JSON → Martin ingest/normalize → persistent store
  → static interactive Dashboard (one URL) → Michael
```

Progressive disclosure: **Home Dashboard → Module view → Detail pane**.

---

## 2. Components

| Layer | What | Where |
|-------|------|--------|
| **Specialist bots** | Greg, Maggie (and future bots) emit JSON per contract | Agent runs / shared box |
| **Ingest (Martin)** | Diff + validate + write dashboard projections | Box scripts under `/workspace/martin-dashboard/` |
| **Persistent store** | Module source JSON + thin `dashboard_feed` index | Shared box + Google Drive mirror |
| **Static web app** | HTML/CSS/JS; reads JSON; no backend server required | Box-built; hosted via Drive public link, GitHub Pages, or local `python -m http.server` |
| **Connected services** | Drive (archive/sync), Gmail (optional alerts later), Calendar (stub), GitHub (optional host) | MCP — write only when Michael asks |

**No cloud agents.** Martin builds and runs everything on the box.

---

## 3. Data flow

### Training (Greg)

1. Greg writes session JSON + updates `progress.json`.
2. Paths (confirmed): Drive `Martin Dashboard/systems-training/sessions/{session_id}.json` and `.../progress.json`.
3. Box mirror (already in use): `/workspace/martin-dashboard/data/systems-training/` (`progress.json`, `deltas/`, `sessions/`).
4. Martin ingest: validate schema 1.0 → upsert `dashboard_feed` card → refresh Home Training strip.
5. Michael opens Home → Training module → session detail (lesson diagram, scenario, knowledge check).

### Marketplace (Maggie)

1. Maggie owns writes to **existing** source of truth: `/workspace/mach-e-watchlist.json`.
2. Daily hunt summary: `/workspace/mach-e-daily-hunt-YYYY-MM-DD.json`.
3. Maggie pings Martin after a hunt.
4. Martin **reads** watchlist + latest daily; **diffs** on `id` + `ask_price` + `status`; does **not** invent a second listing schema.
5. Martin writes only Martin-owned overlays: favorites, feed events, optional UI cache under `data/marketplace/`.
6. Home shows NEW Strong/Exceptional, Best Current, price drops, sold/removed, budget signal, Exceptional-private banner.

### Generic feed

Any bot (or Martin) can append a `dashboard_feed` item (alert / recommendation / status). Home renders the latest N.

---

## 4. Storage choice (MVP)

**Primary: shared box JSON files + Google Drive mirror for durability and Michael access.**

| Store | Role |
|-------|------|
| `/workspace/mach-e-watchlist.json` | Maggie source of truth (do not fork) |
| `/workspace/mach-e-daily-hunt-*.json` | Maggie run artifacts |
| `/workspace/martin-dashboard/data/` | Martin projections: `dashboard_feed.json`, training mirror, `marketplace/favorites.json`, `marketplace/ui_state.json` |
| Google Drive `Martin Dashboard/` | Canonical training sessions + progress; optional sync of feed + built `dist/` |

**Why not Sheets / DB for v1:** bots already emit nested JSON (price_history[], lesson graphs). JSON files keep schema fidelity, work offline on the box, and sync via Drive MCP without a database. Sheets can be a later export for ad-hoc filters if needed.

**Hosting for one URL:**

1. **Preferred MVP:** build static site into `dist/`; serve locally or publish folder to Drive / GitHub Pages so Michael has one bookmark.
2. **Dev loop:** `python -m http.server` from `dist/` on the box desktop browser.
3. Avoid app servers, auth stacks, and cloud runtimes until the loop is proven.

---

## 5. Module plugin pattern

Each module is a directory + manifest; the shell does not hardcode bot logic beyond registry.

```
/workspace/martin-dashboard/
  ARCHITECTURE.md … (these docs)
  app/                 # static shell: index.html, css, js
  modules/
    training/
      manifest.json    # id, title, bot, data_paths, home_slots, routes
      home.js          # renders Home card strip
      module.js        # module list + detail
    marketplace/
      manifest.json
      home.js
      module.js
  data/
    dashboard_feed.json
    systems-training/  # mirror / cache
    marketplace/       # favorites, last_diff.json
  scripts/
    ingest_training.py
    ingest_marketplace.py
    build_feed.py
    sync_drive.py      # optional Drive push/pull via MCP instructions
  dist/                # built static site
```

**`manifest.json` (required fields):** `id`, `title`, `bot`, `version`, `data_paths[]`, `home_component`, `module_route`, `owns_writes[]`, `reads[]`.

Shell loads manifests → registers Home slots → lazy-loads module routes. New bot = new folder + ingest script + feed events; shell unchanged.

---

## 6. Hosting options (ranked for personal command center)

| Option | Pros | Cons | MVP pick |
|--------|------|------|----------|
| Static on box + bookmark to local/tunnel URL | Fastest iterate | Not always reachable off-box | Dev |
| GitHub Pages from `dist/` | One public/private URL | Needs push + Pages enable | **Ship target** |
| Drive-hosted `index.html` + JSON | Uses existing Drive | Awkward MIME/CORS for JS fetching JSON | Backup |
| Cloud Run / Firebase | Always-on | Overkill; not available as “just build it” without extra ops | Later |

**Decision:** static SPA reading JSON from same origin (or Drive-exported copies baked into `dist/data/` at build time). Build step copies latest JSON into `dist/data/` so hosting is zero-backend.

---

## 7. Security / trust (MVP)

- No secrets in the static site.
- Marketplace URLs are public listing links; training content is Michael’s personal curriculum — keep Drive folder private; Pages private or unlisted if possible.
- Martin never sends Gmail/Slack without explicit Michael approval (per bot rules).

---

## 8. Assumptions (marked)

- **A1:** Greg schema 1.0 fields listed in DATA_MODEL are the contract; sample session may not exist on box yet — Drive path is source of truth once Greg writes.
- **A2:** Maggie watchlist + daily hunt on box are live and authoritative; Martin never rewrites candidate records.
- **A3:** Michael will open the dashboard at least daily after Maggie hunts and after Greg sessions.
- **A4:** “One URL” for v1 may be GitHub Pages or a stable path Martin documents; exact host chosen at build time.

---

## 9. Absolute next engineering step

See MVP_SCOPE.md build order step 1: scaffold `app/` + copy Maggie watchlist into `dist/data/` and render Home Marketplace strip from real JSON (no Greg sample required to prove Marketplace half of the loop).
