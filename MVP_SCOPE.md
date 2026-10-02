# MVP Scope

Ruthless smallest version that proves the **full loop for BOTH modules**.

```
Specialist Bot → Martin → Persistent Data → Interactive Dashboard → Michael
```

---

## 1. In scope (v1)

### Shell
- Single static app: Home + two module routes + detail pane pattern.
- Loads JSON from same-origin `data/` (baked at build from box/Drive sources).
- Module plugin manifests for `training` and `marketplace` only.
- `dashboard_feed` list on Home (latest ~10, severity styling).

### Marketplace (Maggie) — must work on **real** files day one
- Read `/workspace/mach-e-watchlist.json` + latest `/workspace/mach-e-daily-hunt-*.json`.
- Ingest script diffs `id` + `ask_price` + `status` → writes `data/marketplace/last_diff.json` + feed items.
- Home strip per HOME_DASHBOARD.md (NEW Strong/Exceptional, Best Current 3–5, price drops, sold/removed, $25k budget, Exceptional-private banner).
- Module: filter by assessment/status/seller_type; list; detail with notes + `price_history` spark/chart; open listing URL; **favorites** toggle (Martin-owned file).
- Run coverage: show latest daily hunt `alert_lead` + counts of buckets.

### Training (Greg) — must work on **contract**; sample or empty states OK until first session lands
- Ingest from Drive path (or box mirror) `sessions/{session_id}.json` + `progress.json`.
- Home strip: phase+topic, % complete, awaiting-answer badge, next rec, last one_thing.
- Module: session list; detail shows diagram_ascii, nodes/edges (simple render), scenario, critique, knowledge_check, one_thing.
- Empty state: “Waiting for Greg session” with path documented — still counts as loop plumbing proven.

### Martin ops
- `scripts/ingest_marketplace.py`, `scripts/ingest_training.py`, `scripts/build_dist.sh` (copy JSON → `dist/data`, copy `app/` → `dist/`).
- Docs in this folder are the spec; no extra product PDF.

---

## 2. Explicitly out of scope (v1)

- User accounts, auth, multi-user.
- Backend API, websockets, Cloud Run, Firebase, databases.
- Cursor / cloud agents as runtime.
- Gmail auto-alerts, Calendar scheduling, Slack posts (draft-only later; no send without Michael).
- Rewriting Maggie’s schema or splitting watchlist into a new DB.
- Photos gallery (field optional — ignore if absent).
- Geo maps / map tiles; `geo_tier` display as text only if present.
- Full graph editor for Greg diagrams (ascii + simple node list is enough).
- Knowledge-check answering **inside** the dashboard (Greg owns pedagogy loop; dashboard displays state).
- Historical analytics beyond embedded `price_history` and daily files already on disk.
- Mobile-native apps; responsive CSS OK but not a design polish goal.
- Perfect visual design / branding pass.
- Automated Maggie/Greg scheduling (bots already run; Martin reacts).

---

## 3. Success criteria

| # | Criterion |
|---|-----------|
| S1 | All five spec markdown files exist and agree (done when this ship lands). |
| S2 | Michael can open **one URL** (or local `dist/index.html`) and see Home with Marketplace data from the live watchlist. |
| S3 | After a Maggie hunt ping, running ingest updates feed + Home counts without hand-editing JSON. |
| S4 | Favoriting a listing persists in `data/marketplace/favorites.json` and reloads. |
| S5 | Training Home/module render correctly from a schema-1.0 session file (real or checked-in fixture). |
| S6 | Awaiting-answer badge and % complete reflect `progress.json`. |
| S7 | No second marketplace schema; watchlist remains Maggie’s file. |
| S8 | New bot could be stubbed by copying `modules/_template` + manifest (template optional but pattern documented). |

**Definition of done for “loop proven”:** S2–S7 true on the box without cloud agents.

---

## 4. Build order

1. **Scaffold** `app/index.html` + CSS/JS shell; routes `#/`, `#/marketplace`, `#/training`; empty Home slots.
2. **Marketplace read path:** copy/symlink watchlist into `dist/data/`; render Home Best Current + budget from real JSON.
3. **`ingest_marketplace.py`:** diff vs previous snapshot; emit feed items; wire Home NEW/drops/sold/Exceptional banner.
4. **Marketplace module + detail + favorites** (price_history chart minimal).
5. **Training ingest + UI:** `progress.json` already on box — wire adapter + Home strip; add minimal session fixture only if `sessions/` still empty when building detail; `ingest_training.py` + module detail.
6. **Drive sync notes/script** for training canonical path (pull → mirror → build).
7. **Publish path:** GitHub Pages or documented local URL; smoke-check both modules.
8. **Harden:** empty states, bad JSON guard, README one-pager for Michael.

---

## 5. Absolute next build step

**Do build order #1–2 immediately:** scaffold the static shell and render the Marketplace Home strip from `/workspace/mach-e-watchlist.json` (Best Current = top active STRONG/EXCEPTIONAL by assessment then price). No Greg dependency. This proves Bot→Data→UI→Michael for Maggie on day one.

---

## 6. Assumptions

- **A-S1:** Live watchlist on box stays the marketplace SoT through v1.
- **A-S2:** Greg Drive writes begin soon; fixture unblocks Training UI earlier.
- **A-S3:** “One URL” may be local for the first demo; Pages follows once `dist/` is stable.
