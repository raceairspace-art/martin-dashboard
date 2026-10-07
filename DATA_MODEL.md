# Data Model (MVP)

Concrete schemas. **Bot write ownership** called out per entity.  
Maggie’s shape is taken from live `/workspace/mach-e-watchlist.json` — do not fork.

---

## 0. Conventions

- Timestamps: ISO-8601; prefer offset (`-07:00`) matching existing Maggie files.
- Money: integers USD (cents not used in Maggie files — keep dollars as int).
- IDs: opaque strings; Maggie uses source-prefixed ids (e.g. `cl-redlands-3FMTK3SS8NMA40995`).
- Martin projections live under `/workspace/martin-dashboard/data/`.

---

## 1. `dashboard_feed` item

**File:** `data/dashboard_feed.json` → `{ "updated_at", "items": [ ... ] }`  
**Writes:** Martin only (from ingest diffs / Greg session events).  
**Reads:** Home shell.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | string | yes | Stable; e.g. `feed-2026-10-02-maggie-new-strong-…` |
| `ts` | string | yes | Event time |
| `module_id` | string | yes | `training` \| `marketplace` \| `system` |
| `bot_id` | string | yes | Origin bot or `martin` |
| `type` | string | yes | `alert` \| `recommendation` \| `status` \| `progress` |
| `severity` | string | yes | `info` \| `low` \| `medium` \| `high` \| `critical` |
| `title` | string | yes | ≤80 chars |
| `summary` | string | yes | ≤240 chars |
| `entity_ref` | object | no | `{ "kind", "id" }` e.g. listing id / session_id |
| `cta` | object | no | `{ "label", "route" }` e.g. `#/marketplace/listing/…` |
| `dismissed` | bool | no | Michael/Martin UI state; default false |
| `payload` | object | no | Small extras (counts, assessment) |

**Example (Maggie-derived):**

```json
{
  "id": "feed-2026-10-02-exceptional-private",
  "ts": "2026-10-02T07:20:00-07:00",
  "module_id": "marketplace",
  "bot_id": "maggie_marketplace",
  "type": "alert",
  "severity": "critical",
  "title": "Exceptional private-party deal",
  "summary": "New or active EXCEPTIONAL DEAL from a private seller — open immediately.",
  "entity_ref": { "kind": "marketplace_listing", "id": "…" },
  "cta": { "label": "Open listing", "route": "#/marketplace/…" }
}
```

---

## 2. Training — `training_lesson` (session)

**Canonical:** Drive `Martin Dashboard/systems-training/sessions/{session_id}.json`  
**Box mirror:** `data/systems-training/sessions/{session_id}.json`  
**Writes:** Greg  
**Reads:** Martin ingest, Training module

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `schema_version` | string | yes | `"1.0"` |
| `session_id` | string | yes | Primary key |
| `phase` | string | yes | Curriculum phase label |
| `topic` | string | yes | Session topic |
| `emitted_at` | string | no | When Greg wrote the file |
| `lesson` | object | yes | See below |
| `scenario` | object/string | yes | Prompt / situation for Michael |
| `critique` | object/string | yes | Greg’s critique of answer / approach |
| `knowledge_check` | object | yes | Question(s), optional choices, answer state |
| `one_thing_to_remember` | string | yes | Home strip highlight |
| `progress` | object | no | Session-scoped progress snapshot |

**`lesson`:**

| Field | Type | Required |
|-------|------|----------|
| `diagram_ascii` | string | yes |
| `nodes` | array | yes | `{ "id", "label", ... }` |
| `edges` | array | yes | `{ "from", "to", "label"? }` |

**`knowledge_check` (minimum):**

| Field | Type | Notes |
|-------|------|-------|
| `prompt` | string | Question text |
| `awaiting_answer` | bool | Drives Home badge |
| `answer` | string/object | optional until Michael/Greg closes loop |
| `result` | string | optional: `pass` \| `retry` \| etc. |

**Assumption A-T1:** Exact nested keys inside `scenario` / `critique` / `knowledge_check` may tighten when first Greg file lands; Home only depends on fields listed in HOME_DASHBOARD.md.

---

## 3. Training — `training_progress`

**Canonical:** Drive `Martin Dashboard/systems-training/progress.json`  
**Box mirror (already present):** `data/systems-training/progress.json`  
**Also observed:** `data/systems-training/deltas/` append-only snapshots; `sessions/` for full session bodies when Greg writes them.  
**Writes:** Greg (Martin may mirror only)  
**Reads:** Home Training strip, Training module

### Home projection fields (UI contract)

Martin normalizes whatever Greg emits into these Home fields:

| Home field | Type | Notes |
|------------|------|-------|
| `percent_complete` | number | 0–100; derive from completed topics if Greg omits |
| `current_phase` | string | Display name |
| `current_topic` | string | Display title |
| `current_session_id` | string | e.g. `phase1-session01` |
| `awaiting_answer` | bool | Badge |
| `next_recommendation` | string | One-line CTA |
| `last_one_thing_to_remember` | string | From latest full session when available |

### Observed on-box shape (2026-10-02) — adapter must accept

Greg’s live `progress.json` uses nested objects (confirmed on box):

| Path | Example / meaning |
|------|-------------------|
| `schema_version` | `"1.0"` |
| `updated_at` | ISO timestamp |
| `session_id` | `phase1-session01` |
| `phase` | `{ "id": 1, "name": "Modern Application Architecture" }` |
| `topic` | `{ "id": "api-as-contract", "title": "API as architectural contract" }` |
| `progress.status` | e.g. `awaiting_answer` |
| `progress.awaiting` | e.g. `scenario` |
| `progress.completed_topic_ids` | array |
| `progress.next_recommended` | `{ topic_id, title, why }` |
| `progress.home_badge` | string for badge text |

**Adapter mapping:**  
`current_phase` ← `phase.name` · `current_topic` ← `topic.title` · `awaiting_answer` ← `progress.status == "awaiting_answer"` · `next_recommendation` ← `progress.next_recommended.why` or `.title` · `percent_complete` ← f(completed_topic_ids) until Greg adds explicit % · `last_one_thing_to_remember` ← session file when present, else omit/empty.

Full session files (brief contract) still expected under `sessions/{session_id}.json` with `lesson`, `scenario`, `critique`, `knowledge_check`, `one_thing_to_remember`. Until then, Training detail shows progress-only empty/partial state.

---

## 4. Marketplace — `marketplace_listing` (candidate)

**Source of truth:** `/workspace/mach-e-watchlist.json` → `candidates[]`  
**Writes:** Maggie only  
**Reads:** Martin ingest, Marketplace module  
**Do not invent a second listing schema.**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | string | yes | Stable listing key |
| `source` | string | yes | e.g. `craigslist`, `cargurus` |
| `url` | string | yes | Listing URL |
| `vin` | string\|null | no | |
| `year` | number | yes | |
| `make` | string | no | Optional 2026-10-07; older rows omit |
| `model` | string | no | Optional 2026-10-07; older rows omit |
| `trim` | string | yes | |
| `category` | string | no | `ev` \| `suv_hyundai` \| `suv_mazda` \| `suv_toyota` \| `mach_e` |
| `miles` | number | yes | |
| `ask_price` | number | yes | USD ask |
| `real_price_est` | number | no | Maggie’s estimate |
| `seller_type` | string | yes | e.g. `private`, `dealer` |
| `location` | string | yes | |
| `distance_mi` | number | no | From Las Vegas |
| `drivetrain` | string | no | |
| `battery` | string | no | Free text OK |
| `epa_range_when_new` | string | no | Free text OK |
| `title_status` | string | no | Prefer clean |
| `assessment` | string | yes | Enum below |
| `first_seen` | string | yes | |
| `last_seen` | string | yes | |
| `price_history` | array | yes | `{ date, price?, note? }` |
| `status` | string | yes | Enum below |
| `notes` | string | no | |

**Optional (Maggie may add; UI tolerates missing):**  
`photos[]`, `why_interesting`, `geo_tier`, `concerns`, `market_value_low`, `market_value_high`, `estimated_savings`  
`make`, `model`, `category` — added 2026-10-07 for multi-target search.  
`category` enum when present: `ev` | `suv_hyundai` | `suv_mazda` | `suv_toyota` | `mach_e`. Older candidates may omit these; Martin infers `mach_e` conservatively from title/model text, else `other`.

**`assessment`:**  
`EXCEPTIONAL DEAL` | `STRONG DEAL` | `FAIR DEAL` | `WEAK DEAL` | `AVOID`

**`status`:**  
`active` | `active_possibly_stale` | `sold_or_removed` | `likely_sold_or_stale` | `possibly_sold_or_stale` | `possibly_sold_or_over_budget` | `over_budget` | `rejected` | `unverified_stale`

**Watchlist root (also Maggie-owned):**  
`updated_at`, `search_base`, `max_purchase_price` (product budget **$21,000** as of 2026-10-07; file may lag), `preferred_max_miles` (50000), `criteria_notes`, `market_snapshot`, `candidates[]`.

**Product criteria (2026-10-07):** mainly Las Vegas / Southern Nevada (stretch ~250 mi only for exceptional private/under-market); max **$21k** real purchase price; targets any EV ≤$21k, Hyundai/Mazda/Toyota SUVs ≤$21k, Mach-E when it fits. Ranking: assessment tier, then **private-party above dealer**, then `estimated_savings` desc, then price asc; geo LV/SoNev first on ties. UI de-emphasizes ask > $21k (toggle to include); does not invent Blue Book / market values.

---

## 5. Marketplace — `marketplace_run`

**File pattern:** `/workspace/mach-e-daily-hunt-YYYY-MM-DD.json`  
**Writes:** Maggie  
**Reads:** Martin (feed + run coverage UI)

Observed / expected fields (from live 2026-10-02 file; treat as contract):

| Field | Type | Notes |
|-------|------|-------|
| `run_at` | string | |
| `quiet` | bool | No material changes |
| `alert_lead` | string | Human summary for Home/feed |
| `new_strong_deals` | array | Card objects with `id`, `assessment`, `ask_price`, … |
| `price_drops` | array | `{ id, from, to, delta, note, url }` |
| `sold_or_removed` | array | (name may vary slightly — ingest should accept common aliases) |
| *other buckets* | array | Pass through for module “run coverage” |

**Martin diff keys vs watchlist:** `id` + `ask_price` + `status` (and assessment changes → feed).

---

## 6. Favorites & price history

### Price history

**Embedded** on each candidate as `price_history[]` — **Maggie writes**.  
Dashboard detail pane charts this array. Martin does not maintain a parallel history table in v1.

### Favorites (Martin-owned)

**File:** `data/marketplace/favorites.json`  
**Writes:** Martin / Michael via UI  
**Reads:** Home (optional pin), Module

```json
{
  "updated_at": "2026-10-02T12:00:00-07:00",
  "items": [
    {
      "listing_id": "cl-redlands-3FMTK3SS8NMA40995",
      "saved_at": "2026-10-02T12:00:00-07:00",
      "note": "Top private contender"
    }
  ]
}
```

| Field | Type | Required |
|-------|------|----------|
| `listing_id` | string | yes — FK to candidate `id` |
| `saved_at` | string | yes |
| `note` | string | no |

If a favorite’s listing disappears from watchlist, UI shows “missing from watchlist” but keeps the favorite row until Michael clears it.

---

## 7. Write-ownership matrix

| Entity / file | Greg | Maggie | Martin | Michael (UI) |
|---------------|------|--------|--------|--------------|
| training session JSON | W | — | mirror | — |
| training progress.json | W | — | mirror | — |
| mach-e-watchlist.json | — | W | R | — |
| mach-e-daily-hunt-*.json | — | W | R | — |
| dashboard_feed.json | — | — | W | dismiss |
| favorites.json | — | — | W | W |
| dist/data bake | — | — | W | — |

---

## 8. Assumptions

- **A-D1:** Greg’s first on-disk sample may arrive after Marketplace UI; Training ingest uses schema above and soft-fails missing files.
- **A-D2:** Daily hunt bucket names beyond those listed are displayed as raw run coverage, not Home-critical.
- **A-D3:** `max_purchase_price: 25000` on watchlist root is the budget signal source for Home.
