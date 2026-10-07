#!/usr/bin/env bash
# Build static Martin Dashboard into dist/ (same-origin JSON, no backend).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/dist"
WATCHLIST_SRC="${WATCHLIST_SRC:-/workspace/mach-e-watchlist.json}"
HUNT_GLOB="${HUNT_GLOB:-/workspace/mach-e-daily-hunt-*.json}"

echo "==> Cleaning $DIST"
rm -rf "$DIST"
mkdir -p "$DIST/data/marketplace" \
         "$DIST/data/systems-training/learner_reports" \
         "$DIST/data/systems-training/sessions" \
         "$DIST/css" \
         "$DIST/js" \
         "$DIST/modules"

echo "==> Copying app shell"
cp "$ROOT/app/index.html" "$DIST/index.html"
cp -R "$ROOT/app/css/." "$DIST/css/"
cp -R "$ROOT/app/js/." "$DIST/js/"

echo "==> Copying modules"
cp -R "$ROOT/modules/." "$DIST/modules/"

echo "==> Copying Martin data projections"
# Training mirror (progress, deltas, sessions)
if [[ -d "$ROOT/data/systems-training" ]]; then
  cp -R "$ROOT/data/systems-training/." "$DIST/data/systems-training/"
fi

# Keep the ingest-produced metadata index in dist while ensuring its id list
# matches the session files copied above (static SPA still consumes session_ids).
SESS_DIR="$DIST/data/systems-training/sessions"
export SESS_DIR
python3 - <<'PY'
import json, os
from pathlib import Path
from datetime import datetime

sess_dir = Path(os.environ["SESS_DIR"])
out = sess_dir.parent / "sessions_index.json"
try:
    index = json.loads(out.read_text()) if out.is_file() else {}
except (OSError, json.JSONDecodeError):
    index = {}
ids = sorted(p.stem for p in sess_dir.glob("*.json") if p.is_file())
existing = {
    item.get("session_id"): item
    for item in index.get("sessions", [])
    if isinstance(item, dict) and item.get("session_id")
}
metadata = []
for sid in ids:
    item = existing.get(sid)
    if item is None:
        try:
            session = json.loads((sess_dir / f"{sid}.json").read_text())
        except (OSError, json.JSONDecodeError):
            session = {}
        item = {
            "session_id": sid,
            "title": session.get("title") or session.get("topic") or sid,
            "status": session.get("status") or (session.get("progress") or {}).get("status", "unknown"),
        }
    metadata.append(item)
index["session_ids"] = ids
index["sessions"] = metadata
index.setdefault("updated_at", datetime.now().astimezone().isoformat(timespec="seconds"))
out.write_text(json.dumps(index, indent=2) + "\n")
print(f"sessions_index: {len(ids)} session(s) → {out}")
PY

# Marketplace Martin-owned overlays
if [[ -f "$ROOT/data/marketplace/favorites.json" ]]; then
  cp "$ROOT/data/marketplace/favorites.json" "$DIST/data/marketplace/favorites.json"
else
  printf '%s\n' '{"updated_at":null,"items":[]}' > "$DIST/data/marketplace/favorites.json"
fi
if [[ -f "$ROOT/data/marketplace/last_diff.json" ]]; then
  cp "$ROOT/data/marketplace/last_diff.json" "$DIST/data/marketplace/last_diff.json"
fi
if [[ -f "$ROOT/data/dashboard_feed.json" ]]; then
  cp "$ROOT/data/dashboard_feed.json" "$DIST/data/dashboard_feed.json"
else
  printf '%s\n' '{"updated_at":null,"items":[]}' > "$DIST/data/dashboard_feed.json"
fi

echo "==> Baking Maggie watchlist (read-only copy; does not modify source)"
if [[ ! -f "$WATCHLIST_SRC" ]]; then
  echo "ERROR: watchlist not found at $WATCHLIST_SRC" >&2
  exit 1
fi
cp "$WATCHLIST_SRC" "$DIST/data/marketplace/watchlist.json"

# Latest daily hunt: prefer YYYY-MM-DD in filename (desc), then mtime (desc).
# Lexicographic basename alone is wrong: "...-07-local-refactor.json" sorts
# BEFORE "...-07.json" because '-' < '.'.
latest_hunt=""
# shellcheck disable=SC2086
export HUNT_GLOB
latest_hunt="$(python3 - <<'PY'
import glob, os, re
pat = os.environ.get("HUNT_GLOB", "/workspace/mach-e-daily-hunt-*.json")
files = [f for f in glob.glob(pat) if os.path.isfile(f)]
date_re = re.compile(r"(\d{4}-\d{2}-\d{2})")

def key(path):
    base = os.path.basename(path)
    m = date_re.search(base)
    date = m.group(1) if m else "0000-00-00"
    try:
        mtime = os.path.getmtime(path)
    except OSError:
        mtime = 0.0
    return (date, mtime)

if not files:
    print("")
else:
    best = max(files, key=key)
    print(best)
PY
)"
if [[ -n "$latest_hunt" ]]; then
  echo "==> Baking daily hunt: $latest_hunt"
  cp "$latest_hunt" "$DIST/data/marketplace/daily_hunt.json"
else
  echo "==> No daily hunt file found (NEW/drops/sold will be placeholders)"
fi

echo "==> Done. Serve with:"
echo "    cd $DIST && python3 -m http.server 8765"
echo "    Open http://127.0.0.1:8765/"
