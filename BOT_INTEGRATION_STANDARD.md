# Bot Integration Standard

Reusable contract so any specialist bot can feed the Martin Dashboard without custom one-offs.

---

## 1. Required bot metadata

Every participating bot declares (in its brief / first feed item / module manifest):

| Field | Type | Notes |
|-------|------|--------|
| `bot_id` | string | Stable id: `greg_systems_training`, `maggie_marketplace` |
| `display_name` | string | Home label |
| `module_id` | string | Matches `modules/<id>/manifest.json` |
| `schema_version` | string | Semver or dated; Greg uses `"1.0"` |
| `output_paths` | string[] | Absolute box and/or Drive paths it writes |
| `ping_protocol` | string | How Martin learns of new output: `message` \| `file_mtime` \| `both` |
| `owns_writes` | string[] | Entity names this bot may create/update |
| `never_writes` | string[] | Explicit denylist (e.g. Maggie never writes `favorites`) |

---

## 2. Output schema conventions

1. **JSON only** for persistence. Chat text may accompany a drop but is not the source of truth.
2. **Stable IDs** on every entity (`session_id`, listing `id`, `run_id`).
3. **Timestamps** ISO-8601 with offset preferred (Maggie’s files use PT offsets).
4. **Enums as strings** with documented allowed values (assessment, status, phase).
5. **Additive evolution:** new optional fields OK; renames/removals require schema_version bump + Martin migrate note.
6. **No duplicate sources of truth.** If a bot already has a file (Maggie watchlist), Martin reuses it — do not invent a parallel schema.

### Envelope (optional, recommended for new bots)

```json
{
  "bot_id": "example_bot",
  "schema_version": "1.0",
  "emitted_at": "2026-10-02T12:00:00-07:00",
  "entities": { "...": "..." },
  "feed_hints": [
    { "type": "alert", "severity": "high", "title": "...", "summary": "..." }
  ]
}
```

Greg and Maggie predate a shared envelope; Martin adapters map their native shapes into feed + module views.

---

## 3. Confirmed bot contracts

### Greg — Systems Training (`greg_systems_training`)

**Schema:** `1.0`  
**Delivery:** agent message + Drive  
`Martin Dashboard/systems-training/sessions/{session_id}.json`  
`Martin Dashboard/systems-training/progress.json`  

**Box mirror (live):** `/workspace/martin-dashboard/data/systems-training/`  
(`progress.json`, `deltas/`, `sessions/` — sessions may be empty until full lesson drop)

**Session object (required conceptual fields for full lesson detail):**

- `session_id`, `phase`, `topic`
- `lesson`: `diagram_ascii`, `nodes[]`, `edges[]`
- `scenario` + `critique`
- `knowledge_check`
- `one_thing_to_remember`
- `progress` (session-local and/or mirrored in `progress.json`)

**Progress shape note:** Live `progress.json` nests `phase`/`topic` objects and a `progress{}` block (`status`, `awaiting`, `next_recommended`, `home_badge`). Martin **adapts** to Home fields — see DATA_MODEL.md. Do not block ingest on flat vs nested.

**Home surface:** phase + topic, % complete (derive if needed), awaiting-answer badge, next recommendation, last `one_thing_to_remember` (when session file exists).

**Owns writes:** `training_lesson` (session files), `training_progress`, deltas.  
**Does not write:** marketplace entities, Michael favorites.

### Maggie — Marketplace (`maggie_marketplace`)

**Reuse existing files — do not invent a second schema.**

| File | Role |
|------|------|
| `/workspace/mach-e-watchlist.json` | Source of truth (`candidates[]`, criteria, market_snapshot) |
| `/workspace/mach-e-daily-hunt-YYYY-MM-DD.json` | Per-run summary (new_strong_deals, price_drops, sold, alert_lead, …) |

**Candidate fields (confirmed):**  
`id`, `source`, `url`, `vin`, `year`, `trim`, `miles`, `ask_price`, `real_price_est`, `seller_type`, `location`, `distance_mi`, `drivetrain`, `battery`, `epa_range_when_new`, `title_status`, `assessment`, `first_seen`, `last_seen`, `price_history[]`, `status`, `notes`  
**Optional (2026-10-07+):** `make`, `model`, `category` (`ev`|`suv_hyundai`|`suv_mazda`|`suv_toyota`|`mach_e`), `fuel`, `priority_rank` (1 = best current), plus earlier optionals `photos[]`, `why_interesting`, `geo_tier`, `concerns`, market value bands.

**Assessment enum:** `EXCEPTIONAL DEAL` \| `STRONG DEAL` \| `FAIR DEAL` \| `WEAK DEAL` \| `AVOID`  
**Status enum:** `active`, `active_possibly_stale`, `sold_or_removed`, `likely_sold_or_stale`, `possibly_sold_or_stale`, `possibly_sold_or_over_budget`, `over_budget`, `rejected`, `unverified_stale`

**Criteria (product rules, not schema; updated 2026-10-07):** mainly Las Vegas / Southern Nevada (stretch ~250 mi for exceptional private/under-market only); max **$21k** real purchase price; targets (1) any EV ≤$21k, (2) Hyundai / Mazda / Toyota SUVs ≤$21k, (3) Mach-E when it fits; ideally **&lt;50k miles**; clean title; **private-party weighted higher** in ranking; geo tiers from Las Vegas.

**Ingest:** Maggie pings after hunt → Martin reads watchlist → diffs `id` + `ask_price` + `status` → updates feed + UI cache only.

**Optional fields (tolerate absence):** `photos[]`, `why_interesting`, `geo_tier`, `concerns`, `make`, `model`, `category`, market value bands — dashboard infers category conservatively when missing.

**Owns writes:** watchlist candidates, daily hunt files, embedded `price_history` on candidates.  
**Does not write:** Martin `favorites`, `dashboard_feed` (Martin writes feed from diffs).

---

## 4. Persistence rules

| Rule | Detail |
|------|--------|
| Bot-owned files | Only that bot updates entity bodies |
| Martin-owned files | `dashboard_feed.json`, `favorites.json`, diff caches, built `dist/data/` |
| Drive | Training canonical on Drive; Marketplace canonical on box (Drive mirror optional) |
| Immutability | Daily hunt files are append-only by date; do not rewrite past runs |
| Diff before feed | Never spam feed on identical re-read; emit events only on material change |
| Validation | Martin ingest rejects/flags unknown required fields; optional fields pass through |

---

## 5. Dashboard card vs module depth

| Depth | Purpose | Content budget |
|-------|---------|----------------|
| **Home card / strip** | Glanceable status + 1–2 CTAs | Counts, badges, top 3–5 items, one banner |
| **Module view** | Working surface | Filters, lists, progress, run coverage |
| **Detail pane** | Full entity | Full JSON-backed fields, charts, diagrams, actions (favorite, open URL) |

**Mapping:**

- Greg Home: phase/topic, %, awaiting-answer, next rec, last one_thing → Module: session list → Detail: lesson + scenario + knowledge check.
- Maggie Home: NEW Strong/Exceptional count, Best Current 3–5, price-drop count, sold/removed, **$21k** budget signal, Exceptional-private banner → Module: category chips + filters + list + run coverage → Detail: listing + price chart + notes + favorite toggle.

Feed items are **cross-module** Home citizens (alerts/recommendations), not a third module.

---

## 6. How a new bot onboards

1. **Brief Martin** with metadata (§1) + schema (or “reuse file X”).
2. **Agree owns_writes** and paths; add `modules/<id>/manifest.json`.
3. **Ship one sample JSON** on the agreed path.
4. Martin adds `scripts/ingest_<id>.py` + `home.js` / `module.js` stubs.
5. First successful ingest must create ≥1 `dashboard_feed` item and a Home strip.
6. Document enums and optional fields in DATA_MODEL.md; bump this standard only if the shared contract changes.

**Checklist (copy/paste):**

- [ ] `bot_id` + `schema_version`  
- [ ] Paths exist and are writable by bot / readable by Martin  
- [ ] Stable entity ids  
- [ ] Home strip fields defined  
- [ ] Diff keys defined (what counts as “new”)  
- [ ] Sample file dropped  
- [ ] Manifest registered  
- [ ] Out-of-scope writes listed  

---

## 7. Assumptions

- **A1:** Greg will write Drive paths as specified; box mirror is Martin’s job if Drive MCP pull is used.
- **A2:** Maggie’s ping may be a chat message; file `updated_at` / daily filename is a sufficient backup signal.
- **A3:** Future bots follow this standard; legacy shapes get a thin adapter rather than forcing rewrites on day one.
