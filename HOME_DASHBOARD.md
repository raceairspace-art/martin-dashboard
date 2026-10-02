# Home Dashboard

What Michael sees **at a glance** when opening the one-URL command center.  
Layout: top alert banner → two module strips → generic feed. Progressive disclosure into modules.

---

## 1. Layout (top → bottom)

```
┌─────────────────────────────────────────────────────────┐
│ Martin Dashboard                         [updated_at]   │
├─────────────────────────────────────────────────────────┤
│ Banner slot (conditional)                               │
│  • Exceptional private-party (Marketplace)              │
│  • Awaiting answer (Training) — if no Exceptional       │
├─────────────────────────────────────────────────────────┤
│ SYSTEMS TRAINING                          [Open →]      │
│  phase · topic · ████░░ 62% · 🔔 awaiting answer        │
│  Next: {next_recommendation}                            │
│  Remember: {last_one_thing_to_remember}                 │
├─────────────────────────────────────────────────────────┤
│ MARKETPLACE (Mach-E)                      [Open →]      │
│  Budget: $25k OTD · {n} active ≤ budget                 │
│  NEW Strong/Exceptional today: {n}                      │
│  Price drops: {n} · Sold/removed: {n}                   │
│  Best Current (3–5 cards)                               │
├─────────────────────────────────────────────────────────┤
│ ALERTS & RECOMMENDATIONS                                │
│  feed items (latest ~10)                                │
└─────────────────────────────────────────────────────────┘
```

Keep density high; no charts on Home except tiny optional price-drop deltas on Best Current cards.

---

## 2. Training strip (Greg)

**Data source:** `data/systems-training/progress.json` (+ latest session under `sessions/` if present).  
Normalize via adapter (nested Greg → Home fields) per DATA_MODEL.md.

| Element | Source (adapted) | Behavior |
|---------|------------------|----------|
| Phase + topic | `phase.name` + `topic.title` | Primary headline |
| % complete | derive from `progress.completed_topic_ids` until explicit % exists | Bar + number (0 OK) |
| Awaiting-answer badge | `progress.status == "awaiting_answer"`; label from `progress.home_badge` | Visible only if awaiting; severity medium/high |
| Next recommendation | `progress.next_recommended.why` (fallback `.title`) | One line CTA text |
| Last one_thing | session `one_thing_to_remember` when file exists | Muted footer; hide if absent |
| Open | `#/training` or `#/training/{session_id}` | |

**Empty state:** “No sessions yet — waiting on Greg (`systems-training/progress.json`).”

**Banner priority:** if `awaiting_answer` and no Exceptional-private marketplace banner, show “Training: answer waiting” in the global banner slot.

---

## 3. Marketplace strip (Maggie)

**Data sources:** watchlist root + `candidates[]`; latest daily hunt; Martin `last_diff.json` / feed.

| Element | Rule |
|---------|------|
| **$25k budget signal** | Show `max_purchase_price` from watchlist; count of `active*` listings with `ask_price ≤ 25000` (and not `over_budget` / `rejected`). |
| **NEW Strong/Exceptional count** | From latest daily `new_strong_deals` length **or** ingest diff since previous snapshot where assessment ∈ {STRONG DEAL, EXCEPTIONAL DEAL} and first_seen/last change is “new”. Prefer daily file when fresh (same calendar day as `run_at`). |
| **Price-drop count** | `price_drops.length` from latest daily hunt (or diff where ask_price decreased). |
| **Sold/removed** | Count from daily sold bucket and/or candidates whose status became `sold_or_removed` / `likely_sold_or_stale` since last ingest. |
| **Best Current (3–5)** | From watchlist `candidates` where status is `active` or `active_possibly_stale`, assessment ∈ {EXCEPTIONAL DEAL, STRONG DEAL}, prefer ask ≤ 25000; sort Exceptional first, then Strong; tie-break lower `ask_price`, then lower `distance_mi`. Card: year/trim, price, miles, assessment chip, seller_type, distance, link. |
| **Exceptional private alert banner** | If any Best Current (or active candidate) has `assessment == "EXCEPTIONAL DEAL"` AND `seller_type` indicates private → **global banner** (highest priority). CTA opens that detail. |
| **Open** | `#/marketplace` |

**Quiet day:** if daily `quiet: true` and no Exceptional banner, show “No material market changes” as status (not an alert).

---

## 4. Generic alert / recommendation slots

**Source:** `data/dashboard_feed.json` items, newest first, hide `dismissed`.

| `type` | Home treatment |
|--------|----------------|
| `alert` | Icon + severity color; high/critical pin above info |
| `recommendation` | Neutral card; CTA if `cta` present |
| `status` | Compact one-liner |
| `progress` | Training-oriented; optional duplicate of strip — prefer strip, feed only for milestones |

**Severity colors:** info grey · low blue · medium amber · high orange · critical red.

**Cap:** 10 visible; “View all” optional later (out of scope polish).

Cross-module: feed is how non-Home-native events appear (e.g. ingest errors as `system` / `status`).

---

## 5. Interaction rules

- Entire module strip clickable → module route; individual Best Current card → detail.
- Banner CTA → entity detail, not just module root.
- No edit of Greg/Maggie fields on Home.
- Favorite star allowed on Best Current cards (writes `favorites.json`) — optional nicety if detail favorites already ship; else detail-only is fine for v1.

---

## 6. Freshness

Show global `updated_at` = max of watchlist `updated_at`, latest daily `run_at`, progress `updated_at`, feed `updated_at`.  
If Marketplace data older than 36h, subtle “stale data” hint on Marketplace strip.

---

## 7. Assumptions

- **A-H1:** “Private” seller_type match is case-insensitive equality to `private` (as in live watchlist).
- **A-H2:** Only one global banner at a time; Exceptional private beats Training awaiting-answer.
- **A-H3:** Best Current does not include AVOID/WEAK/over_budget even if oddly marked active.
