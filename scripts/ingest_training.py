#!/usr/bin/env python3
"""Project Systems Training progress and sessions into Martin's feed.

Run from the repository root (or from any working directory):
    python3 scripts/ingest_training.py

The source files remain untouched.  The generated feed entries are keyed by
session/topic so running this repeatedly updates entries rather than adding
duplicates.
"""
from __future__ import annotations

import json
import re
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
TRAINING = ROOT / "data" / "systems-training"
PROGRESS = TRAINING / "progress.json"
SESSIONS = TRAINING / "sessions"
INDEX = TRAINING / "sessions_index.json"
FEED = ROOT / "data" / "dashboard_feed.json"

TRAINING_ID_PREFIX = "feed-training-"


def now_pt_iso() -> str:
    try:
        from zoneinfo import ZoneInfo

        return datetime.now(ZoneInfo("America/Los_Angeles")).isoformat(timespec="seconds")
    except Exception:
        return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def load_json(path: Path) -> Any:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: Path, value: Any) -> None:
    """Write JSON atomically so a partially-written projection is not served."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", dir=path.parent, delete=False
    ) as handle:
        json.dump(value, handle, indent=2)
        handle.write("\n")
        temporary = Path(handle.name)
    temporary.replace(path)


def validate_schema_version(value: Any, path: Path) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError(f"{path}: expected a JSON object")
    if not value.get("schema_version"):
        raise ValueError(f"{path}: missing schema_version")
    return value


def text(value: Any, fallback: str = "") -> str:
    return value if isinstance(value, str) and value else fallback


def slug(value: str) -> str:
    result = re.sub(r"[^A-Za-z0-9._-]+", "-", value).strip("-")
    return result or "unknown"


def progress_block(progress: dict[str, Any]) -> dict[str, Any]:
    value = progress.get("progress")
    return value if isinstance(value, dict) else {}


def session_status(session: dict[str, Any]) -> str:
    nested = session.get("progress")
    candidates = [
        session.get("status"),
        nested.get("status") if isinstance(nested, dict) else None,
    ]
    for candidate in candidates:
        if isinstance(candidate, str) and candidate:
            return candidate
    if session.get("completed") is True or session.get("completed_at"):
        return "completed"
    knowledge = session.get("knowledge_check")
    if isinstance(knowledge, dict) and knowledge.get("result") in {
        "pass",
        "passed",
        "complete",
        "completed",
    }:
        return "completed"
    return "unknown"


def session_id_for(path: Path, session: dict[str, Any]) -> str:
    value = session.get("session_id")
    return text(value, path.stem)


def session_title(session: dict[str, Any], session_id: str) -> str:
    return text(session.get("title"), text(session.get("topic"), session_id))


def is_completed(session: dict[str, Any], status: str) -> bool:
    normalized = status.lower().replace("-", "_")
    return normalized in {"complete", "completed", "done", "passed"}


def feed_base(
    item_id: str,
    ts: str,
    title: str,
    summary: str,
    item_type: str,
    severity: str,
    session_id: str | None = None,
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    item: dict[str, Any] = {
        "id": item_id,
        "ts": ts,
        "module_id": "training",
        "bot_id": "greg_systems_training",
        "type": item_type,
        "severity": severity,
        "title": title[:80],
        "summary": summary[:240],
        "cta": {"label": "Open Training", "route": "#/training"},
        "dismissed": False,
    }
    if session_id:
        item["entity_ref"] = {"kind": "training_session", "id": session_id}
        item["cta"]["route"] = f"#/training/{session_id}"
    if payload:
        item["payload"] = payload
    return item


def training_feed_items(
    progress: dict[str, Any], sessions: list[tuple[str, dict[str, Any], str]]
) -> list[dict[str, Any]]:
    block = progress_block(progress)
    status = text(block.get("status"), text(progress.get("status"))).lower()
    session_id = text(progress.get("session_id"))
    ts = text(progress.get("updated_at"), now_pt_iso())
    items: list[dict[str, Any]] = []

    if status == "awaiting_answer":
        badge = text(block.get("home_badge"), "Awaiting your answer")
        awaiting = text(block.get("awaiting"), "answer")
        topic = progress.get("topic")
        topic_title = topic.get("title") if isinstance(topic, dict) else topic
        summary = badge
        if awaiting:
            summary += f" ({awaiting})"
        if topic_title:
            summary += f" · {topic_title}"
        items.append(
            feed_base(
                f"{TRAINING_ID_PREFIX}awaiting-{slug(session_id or 'current')}",
                ts,
                f"Training: {badge}",
                summary,
                "alert",
                "medium",
                session_id or None,
                {"status": "awaiting_answer", "awaiting": awaiting},
            )
        )

    for sid, session, session_ts in sessions:
        status = session_status(session)
        if is_completed(session, status):
            title = session_title(session, sid)
            items.append(
                feed_base(
                    f"{TRAINING_ID_PREFIX}completed-{slug(sid)}",
                    text(session.get("emitted_at"), session_ts),
                    f"Training session completed: {title}",
                    f"Completed session {sid}.",
                    "status",
                    "info",
                    sid,
                    {"session_id": sid, "status": status, "title": title},
                )
            )

    next_recommended = block.get("next_recommended")
    if isinstance(next_recommended, dict):
        topic_id = text(next_recommended.get("topic_id"), session_id or "next")
        title = text(next_recommended.get("title"), topic_id)
        why = text(next_recommended.get("why"), title)
        items.append(
            feed_base(
                f"{TRAINING_ID_PREFIX}next-{slug(topic_id)}",
                ts,
                f"Next training: {title}",
                why,
                "recommendation",
                "low",
                session_id or None,
                {"topic_id": topic_id, "title": title, "why": why},
            )
        )
    return items


def merge_training_feed(existing: Any, generated: list[dict[str, Any]]) -> dict[str, Any]:
    base = existing if isinstance(existing, dict) else {}
    old_items = base.get("items") if isinstance(base.get("items"), list) else []
    generated_by_id = {item["id"]: item for item in generated}
    # Replace all entries owned by this projection, removing stale awaiting/next
    # cards when Greg advances.  Other modules' entries are preserved verbatim.
    other_items = [
        item
        for item in old_items
        if not (isinstance(item, dict) and str(item.get("id", "")).startswith(TRAINING_ID_PREFIX))
    ]
    return {
        "updated_at": now_pt_iso(),
        "items": list(generated_by_id.values()) + other_items,
    }


def build_sessions_index(
    sessions: list[tuple[str, dict[str, Any], str]], updated_at: str
) -> dict[str, Any]:
    metadata = []
    for sid, session, _ in sessions:
        metadata.append(
            {
                "session_id": sid,
                "title": session_title(session, sid),
                "status": session_status(session),
            }
        )
    metadata.sort(key=lambda item: item["session_id"])
    return {
        "updated_at": updated_at,
        # Keep the string list for the existing static UI loader.
        "session_ids": [item["session_id"] for item in metadata],
        # Metadata lets consumers render a list without loading every session.
        "sessions": metadata,
    }


def main() -> int:
    if not PROGRESS.is_file():
        raise SystemExit(f"Training progress not found: {PROGRESS}")
    progress = validate_schema_version(load_json(PROGRESS), PROGRESS)

    sessions: list[tuple[str, dict[str, Any], str]] = []
    if SESSIONS.is_dir():
        for path in sorted(SESSIONS.glob("*.json")):
            session = validate_schema_version(load_json(path), path)
            sid = session_id_for(path, session)
            sessions.append((sid, session, text(session.get("emitted_at"), now_pt_iso())))

    updated_at = text(progress.get("updated_at"), now_pt_iso())
    write_json(INDEX, build_sessions_index(sessions, updated_at))
    generated = training_feed_items(progress, sessions)
    existing = load_json(FEED) if FEED.is_file() else None
    write_json(FEED, merge_training_feed(existing, generated))

    print(f"Training sessions indexed: {len(sessions)} → {INDEX}")
    print(f"Training feed items upserted: {len(generated)}")
    print(f"Dashboard feed total: {len(merge_training_feed(existing, generated)['items'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
