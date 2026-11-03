# Black Friday 2026 Deals tab (`#/black-friday`)

Holiday-catalog page fed by two agents' sweep files. Tiles show **only** picture, item and
price; the whole tile opens `source_url` in a new tab. Retailer, discount, status, notes and
price history stay in the data (`dist/data/black-friday/deals.json`), not on tiles.

## Inputs (read-only, owned by the agents)
`/workspace/black-friday-2026/` (override with `BF_SRC=/path`):
- `gear-tech-sweep-YYYY-MM-DD.json`: BlackFridayFrank (Mon/Wed/Fri)
- `travel-sweep-YYYY-MM-DD.json`: Travelin Sam
- Extra same-day sweeps may add a numeric suffix: `gear-tech-sweep-YYYY-MM-DD-2.json`, `-3`, … (all are merged; per `item_key` the newest `swept_at` wins)

Any other file name (e.g. `*.bak.json`, `gear-tech-sweep-2026-11-03b.json`) is ignored: a second
same-day sweep needs its own `swept_at`, so ask the agent to use the contract name/fields.
`deal_status` is kept exactly as given (missing stays null); only `"expired"` is hidden. The ingest never writes to this folder.

## Refresh (after a new sweep lands)
```bash
cd /workspace/martin-dashboard
bash scripts/build_dist.sh          # runs scripts/ingest_black_friday.py, then copies data + images to dist/
git add data/black-friday && git commit -m "Black Friday: refresh <date>" && git push   # main (normal push)
# publish dist/ to gh-pages exactly like the other tabs (clone gh-pages, replace contents, push)
```
`BF_NO_FETCH=1 bash scripts/build_dist.sh` builds with cached images only (no network).
The ingest is non-fatal: if it fails, the last committed `data/black-friday/deals.json` is published.

## What the ingest does (`scripts/ingest_black_friday.py`)
- Applies sweeps oldest → newest (`swept_at`); merges by `item_key`; the newest sweep wins for every field.
- `price_history`: one `{swept_at, price}` per sweep (number or null, as swept).
- Prices are never invented. Numbers pass through. A text price keeps the agent's own first `$` amount as
  `price_label` (`"from $208.99"`, `"$250 deposit"`), and `price_raw` keeps the original. Text without
  a `$` amount (`"see item"`) → null → the tile says **See deal**.
- Images: each https `image_url` is fetched once (1 s apart, 15 s timeout, 8 MB cap, image/* only),
  verified with Pillow, shrunk to ≤900 px WebP, and cached as `data/black-friday/img/<sha1-16>.webp`
  (committed, so builds don't re-download). Failures are retried at most once per 24 h
  (`img_index.json`) and fall back to a holiday placeholder with the section/subsection icon.
  Images no deal references any more are removed from the cache.
- Hidden by default: `deal_status: "expired"` (a "Show N expired" toggle sits at the bottom).
- "Last updated" = newest `swept_at` across all sweeps.

## Sections: one config file
`config/black_friday_sections.json` holds the display order, title, icon, the `category` values that map
to each section, and optional subsections (matched on category **or** subcategory). Deals from either
file can land in any section. A category listed nowhere goes to **Wildcard** (`"fallback": true`).
Adding a category or section is a one-line edit there; rebuild to apply. Empty sections are hidden.

Current order: Vegas Local (`vegas_local`) · Concerts & Theater (`concerts_theater`: concert_ticket,
concert_pass, theater, vip_package, travel_package) · Gear & tech (Jet skis, Motorcycles, RC aircraft, Drones,
FPV goggles, Maker gear, New tech) · Trending robots · Computers & TVs · Gaming (`gaming`: Games, Consoles,
Gaming PCs, Accessories, Hardware; matched on `subcategory` `games`, `consoles`, `gaming_pcs`, `accessories`,
`hardware`) · Winter ski (`ski_gear` + `ski_travel`) ·
Season passes (`season_passes`: Ski passes, Amusement parks, Museums & attractions, Memberships) · Travel
(Flights, Cruises, Hotels, Packages) · Wildcard. Reorder by moving entries in the `sections` array.

Icons available: pass ferris museum dice gift robot monitor ski plane ship bed suitcase ticket music masks crown star wave
moto rcplane drone goggles maker chip gamepad disc handheld pc headset (see `ICONS` in `modules/black-friday/module.js`).

## Files
- `scripts/ingest_black_friday.py`, `config/black_friday_sections.json`
- `data/black-friday/deals.json`, `data/black-friday/img/`, `data/black-friday/img_index.json`
- `modules/black-friday/module.js` (page + Home tile), CSS under "Black Friday 2026" in `app/css/styles.css`
