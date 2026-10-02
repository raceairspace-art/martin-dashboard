#!/usr/bin/env python3
"""Diff Maggie watchlist (id + ask_price + status) → last_diff + dashboard_feed.

Does not modify /workspace/mach-e-watchlist.json.
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_WATCHLIST = Path("/workspace/mach-e-watchlist.json")
PREV_SNAPSHOT = ROOT / "data" / "marketplace" / "prev_watchlist_snapshot.json"
LAST_DIFF = ROOT / "data" / "marketplace" / "last_diff.json"
FEED = ROOT / "data" / "dashboard_feed.json"
DEALS = {"STRONG DEAL", "EXCEPTIONAL DEAL"}


def now_pt_iso() -> str:
    # Store with -07:00 offset label for consistency with Maggie files (PT approx).
    # Box is America/Los_Angeles; use local offset if available.
    try:
        from zoneinfo import ZoneInfo

        return datetime.now(ZoneInfo("America/Los_Angeles")).isoformat(
            timespec="seconds"
        )
    except Exception:
        return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def load_json(path: Path) -> Any:
    with path.open() as f:
        return json.load(f)


def save_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")


def index_candidates(wl: dict) -> dict[str, dict]:
    return {c["id"]: c for c in wl.get("candidates") or [] if c.get("id")}


def diff_watchlists(prev: dict | None, curr: dict) -> dict:
    curr_idx = index_candidates(curr)
    prev_idx = index_candidates(prev) if prev else {}

    new_ids = [i for i in curr_idx if i not in prev_idx]
    removed_ids = [i for i in prev_idx if i not in curr_idx]
    price_drops = []
    status_changes = []
    assessment_changes = []
    new_strong = []

    for cid, c in curr_idx.items():
        if cid in new_ids and c.get("assessment") in DEALS:
            new_strong.append(
                {
                    "id": cid,
                    "assessment": c.get("assessment"),
                    "ask_price": c.get("ask_price"),
                    "status": c.get("status"),
                }
            )
        if cid not in prev_idx:
            continue
        p = prev_idx[cid]
        if p.get("ask_price") != c.get("ask_price"):
            try:
                old_p = float(p.get("ask_price"))
                new_p = float(c.get("ask_price"))
            except (TypeError, ValueError):
                old_p = new_p = None
            if old_p is not None and new_p is not None and new_p < old_p:
                price_drops.append(
                    {
                        "id": cid,
                        "from": p.get("ask_price"),
                        "to": c.get("ask_price"),
                        "delta": new_p - old_p,
                    }
                )
        if p.get("status") != c.get("status"):
            status_changes.append(
                {
                    "id": cid,
                    "from": p.get("status"),
                    "to": c.get("status"),
                }
            )
        if p.get("assessment") != c.get("assessment"):
            assessment_changes.append(
                {
                    "id": cid,
                    "from": p.get("assessment"),
                    "to": c.get("assessment"),
                }
            )
            if c.get("assessment") in DEALS and p.get("assessment") not in DEALS:
                new_strong.append(
                    {
                        "id": cid,
                        "assessment": c.get("assessment"),
                        "ask_price": c.get("ask_price"),
                        "status": c.get("status"),
                        "via": "assessment_upgrade",
                    }
                )

    sold_or_removed = [
        s
        for s in status_changes
        if s["to"]
        in {
            "sold_or_removed",
            "likely_sold_or_stale",
            "possibly_sold_or_stale",
        }
    ] + [{"id": i, "from": prev_idx[i].get("status"), "to": "missing"} for i in removed_ids]

    return {
        "diffed_at": now_pt_iso(),
        "watchlist_updated_at": curr.get("updated_at"),
        "had_previous": prev is not None,
        "counts": {
            "new_listings": len(new_ids),
            "removed_listings": len(removed_ids),
            "new_strong_or_exceptional": len(new_strong),
            "price_drops": len(price_drops),
            "sold_or_removed": len(sold_or_removed),
            "status_changes": len(status_changes),
            "assessment_changes": len(assessment_changes),
        },
        "new_ids": new_ids,
        "removed_ids": removed_ids,
        "new_strong_or_exceptional": new_strong,
        "price_drops": price_drops,
        "sold_or_removed": sold_or_removed,
        "status_changes": status_changes,
        "assessment_changes": assessment_changes,
    }


def feed_items_from_diff(diff: dict) -> list[dict]:
    items = []
    ts = diff["diffed_at"]
    for n in diff.get("new_strong_or_exceptional") or []:
        sev = "critical" if n.get("assessment") == "EXCEPTIONAL DEAL" else "high"
        items.append(
            {
                "id": f"feed-{ts[:10]}-maggie-new-{n['id']}"[:120],
                "ts": ts,
                "module_id": "marketplace",
                "bot_id": "maggie_marketplace",
                "type": "alert",
                "severity": sev,
                "title": f"New {n.get('assessment')}",
                "summary": f"Listing {n['id']} at ${n.get('ask_price')}",
                "entity_ref": {"kind": "marketplace_listing", "id": n["id"]},
                "cta": {
                    "label": "Open Marketplace",
                    "route": "#/marketplace",
                },
                "dismissed": False,
                "payload": n,
            }
        )
    if diff["counts"]["price_drops"]:
        items.append(
            {
                "id": f"feed-{ts[:10]}-maggie-drops-{diff['counts']['price_drops']}",
                "ts": ts,
                "module_id": "marketplace",
                "bot_id": "maggie_marketplace",
                "type": "recommendation",
                "severity": "medium",
                "title": f"{diff['counts']['price_drops']} price drop(s)",
                "summary": "Ask price decreased vs previous snapshot.",
                "cta": {"label": "Open Marketplace", "route": "#/marketplace"},
                "dismissed": False,
            }
        )
    if diff["counts"]["sold_or_removed"]:
        items.append(
            {
                "id": f"feed-{ts[:10]}-maggie-sold-{diff['counts']['sold_or_removed']}",
                "ts": ts,
                "module_id": "marketplace",
                "bot_id": "maggie_marketplace",
                "type": "status",
                "severity": "info",
                "title": f"{diff['counts']['sold_or_removed']} sold/removed",
                "summary": "Listings left active under-budget pool or marked sold.",
                "cta": {"label": "Open Marketplace", "route": "#/marketplace"},
                "dismissed": False,
            }
        )
    return items


def merge_feed(existing: dict | None, new_items: list[dict]) -> dict:
    base = existing or {"updated_at": None, "items": []}
    items = list(base.get("items") or [])
    seen = {i.get("id") for i in items}
    for it in new_items:
        if it["id"] in seen:
            continue
        items.insert(0, it)
        seen.add(it["id"])
    return {"updated_at": now_pt_iso(), "items": items[:50]}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--watchlist", type=Path, default=DEFAULT_WATCHLIST)
    ap.add_argument(
        "--reset-snapshot",
        action="store_true",
        help="Overwrite previous snapshot without emitting feed (bootstrap).",
    )
    args = ap.parse_args()

    if not args.watchlist.is_file():
        raise SystemExit(f"Watchlist not found: {args.watchlist}")

    curr = load_json(args.watchlist)
    prev = load_json(PREV_SNAPSHOT) if PREV_SNAPSHOT.is_file() else None

    if args.reset_snapshot:
        save_json(PREV_SNAPSHOT, curr)
        print(f"Snapshot reset → {PREV_SNAPSHOT}")
        return 0

    diff = diff_watchlists(prev, curr)
    save_json(LAST_DIFF, diff)

    feed_path = FEED
    existing_feed = load_json(feed_path) if feed_path.is_file() else None
    # Only emit feed events when we had a previous snapshot (avoid bootstrap spam)
    if diff["had_previous"]:
        new_items = feed_items_from_diff(diff)
        save_json(feed_path, merge_feed(existing_feed, new_items))
        print(f"Feed += {len(new_items)} item(s) → {feed_path}")
    else:
        print("No previous snapshot — wrote last_diff only (no feed spam).")
        if not feed_path.is_file():
            save_json(feed_path, {"updated_at": now_pt_iso(), "items": []})

    save_json(PREV_SNAPSHOT, curr)
    print(json.dumps(diff["counts"], indent=2))
    print(f"Wrote {LAST_DIFF}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
