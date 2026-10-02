# Favorites (MVP)

**Shape:** `favorites.json` — `{ updated_at, items: [{ listing_id, saved_at, note? }] }`

**Interactive SPA (no backend):** the Marketplace favorite toggle writes to
`localStorage` key `martin-dashboard-favorites` (same JSON shape). On load,
localStorage overlays / wins over the seeded `favorites.json`.

**Build / ingest:** when a merge path exists, read localStorage export (or a
future UI “export favorites” dump) and merge into `data/marketplace/favorites.json`
before `build_dist.sh` copies it into `dist/`. Do not write favorites into
Maggie’s watchlist.

**Missing listings:** if a favorited `listing_id` disappears from the watchlist,
keep the favorite row until Michael clears it; UI shows “missing from watchlist”.
