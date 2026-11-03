# Marketplace paused (since 2026-11-03)

Michael found a car, so the car search is paused and Maggie's daily hunt has stopped.
One switch controls this: `config/marketplace.env` → `MARKETPLACE_PAUSED=1`.

While paused:
- `scripts/build_dist.sh` bakes only `dist/data/marketplace/status.json` (`{"paused": true, ...}`).
  No watchlist, daily hunt, special searches (`*-search-*.json`), last_diff or favorites go into dist.
  Marketplace items (`module_id: marketplace`) are dropped from the **built** `dist/data/dashboard_feed.json`.
  The repo copy in `data/` is unchanged.
- The SPA reads `status.json` first and requests no car data. `#/marketplace`, `#/marketplace/<id>` and
  `#/marketplace/search/...` all show "Marketplace paused — no active searches". The Home tile shows the same state.
- `scripts/ingest_marketplace.py` refuses to run (exit 3).
- The module code, the repo snapshot (`data/marketplace/prev_watchlist_snapshot.json`), `last_diff.json`, the feed history,
  and Maggie's source files in `/workspace` are all kept.

## Restore
1. Set `MARKETPLACE_PAUSED=0` in `config/marketplace.env`. To try it once without editing the file, run
   `MARKETPLACE_PAUSED=0 scripts/build_dist.sh`.
2. Run the usual cycle: `python3 scripts/ingest_marketplace.py --watchlist /workspace/mach-e-watchlist.json`,
   then `scripts/build_dist.sh`, commit to main, and publish gh-pages.
   The first ingest diffs against the 2026-10-31 snapshot, so its counts cover the whole pause.
