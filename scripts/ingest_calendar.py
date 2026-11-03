#!/usr/bin/env python3
"""Turn a raw Google Calendar dump (user-Google-calendar list_events output) into
the minimal public calendar file the dashboard bakes: data/calendar/events.json.

Only four fields per event are kept: title, start (YYYY-MM-DD), end (YYYY-MM-DD,
INCLUSIVE last day) and all_day. No descriptions, locations, attendees, links or ids.

Dropped (and listed on stdout so a human can review them, never written to disk):
  * cancelled events, events marked private/confidential, events the owner declined;
  * titles that look personal or sensitive (medical, financial, legal, private appts).

Usage:
  python3 scripts/ingest_calendar.py --raw /path/to/list_events_dump.txt [--raw page2.txt]
      [--today YYYY-MM-DD] [--out data/calendar/events.json]

The raw dump may be the connector's JSON object (optionally followed by a trailing
note), a bare list of events, or several files (pages). The window is the previous
month through the next two months relative to --today (default: today in
America/Los_Angeles).
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUT = ROOT / "data" / "calendar" / "events.json"
TZ = ZoneInfo("America/Los_Angeles")

SENSITIVE = re.compile(
    r"\b(doctor|dr\.|dentist|dental|orthodont\w*|physician|clinic|hospital|medical|"
    r"therap(y|ist)|counsel+ing|psychiatr\w*|psycholog\w*|appointment|appt|surgery|"
    r"procedure|colonoscopy|mri|x-?ray|lab ?work|blood ?(test|draw|work)|vaccin\w*|"
    r"flu shot|pharmacy|prescription|chiropract\w*|dermatolog\w*|optometr\w*|eye exam|"
    r"check-?up|physical exam|biopsy|rehab|urgent care|"
    r"bank|loan|mortgage|credit card|debt|tax(es)?|irs|payment|bill(s)? due|rent due|"
    r"payroll|invoice|salary|refund|budget review|"
    r"attorney|lawyer|court|hearing|divorce|custody|probation|dmv|"
    r"interview|personal|private|confidential)\b",
    re.I,
)


def load_events(paths: list[Path]) -> list[dict]:
    events: list[dict] = []
    dec = json.JSONDecoder()
    for p in paths:
        text = p.read_text().lstrip()
        doc, _ = dec.raw_decode(text)  # tolerate trailing notes after the JSON
        if isinstance(doc, dict):
            if doc.get("nextPageToken"):
                print(f"WARNING: {p.name} has nextPageToken — fetch the next page too.", file=sys.stderr)
            items = doc.get("events") or doc.get("items") or []
        else:
            items = doc
        events.extend(e for e in items if isinstance(e, dict))
    return events


def local_day(dt_str: str) -> datetime:
    return datetime.fromisoformat(dt_str.replace("Z", "+00:00")).astimezone(TZ)


def span(e: dict) -> tuple[date, date, bool] | None:
    s, en = e.get("start") or {}, e.get("end") or {}
    if s.get("date"):
        start = date.fromisoformat(s["date"])
        end_excl = date.fromisoformat(en.get("date") or s["date"])
        last = max(start, end_excl - timedelta(days=1))
        return start, last, True
    if s.get("dateTime"):
        ds = local_day(s["dateTime"])
        de = local_day(en.get("dateTime") or s["dateTime"])
        last_dt = de - timedelta(microseconds=1) if de > ds else ds
        return ds.date(), last_dt.date(), False
    return None


def month_add(d: date, n: int) -> date:
    y, m = divmod(d.month - 1 + n, 12)
    return date(d.year + y, m + 1, 1)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--raw", type=Path, action="append", required=True)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--today", type=date.fromisoformat, default=None)
    args = ap.parse_args()

    today = args.today or datetime.now(TZ).date()
    win_start = month_add(today.replace(day=1), -1)
    win_end = month_add(today.replace(day=1), 3) - timedelta(days=1)

    excluded: list[tuple[str, str, str]] = []
    seen: set[tuple] = set()
    out: list[dict] = []
    for e in load_events(args.raw):
        title = re.sub(r"\s+", " ", str(e.get("summary") or "")).strip()
        sp = span(e)
        if not title or not sp:
            continue
        start, last, all_day = sp
        if last < win_start or start > win_end:
            continue
        reason = None
        if e.get("status") == "cancelled":
            reason = "cancelled"
        elif e.get("visibility") in ("private", "confidential"):
            reason = f"visibility={e.get('visibility')}"
        elif any(a.get("self") and a.get("responseStatus") == "declined" for a in e.get("attendees") or []):
            reason = "declined"
        elif SENSITIVE.search(title):
            reason = "looks personal/sensitive"
        if reason:
            if reason != "cancelled":
                excluded.append((start.isoformat(), title, reason))
            continue
        key = (title.casefold(), start, last, all_day)
        if key in seen:
            continue
        seen.add(key)
        out.append({"title": title, "start": start.isoformat(), "end": last.isoformat(), "all_day": all_day})

    out.sort(key=lambda x: (x["start"], -(date.fromisoformat(x["end"]) - date.fromisoformat(x["start"])).days, x["title"].casefold()))
    months = []
    m = win_start
    while m <= win_end:
        months.append(m.strftime("%Y-%m"))
        m = month_add(m, 1)
    doc = {
        "generated_at": datetime.now(TZ).isoformat(timespec="seconds"),
        "timezone": "America/Los_Angeles",
        "end_is_inclusive": True,
        "months": months,
        "events": out,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n")

    per = {mo: 0 for mo in months}
    for ev in out:
        for mo in months:
            ms = date.fromisoformat(mo + "-01")
            me = month_add(ms, 1) - timedelta(days=1)
            if date.fromisoformat(ev["start"]) <= me and date.fromisoformat(ev["end"]) >= ms:
                per[mo] += 1
    print(f"Wrote {len(out)} event(s) → {args.out}")
    print("Per month (events touching the month): " + ", ".join(f"{k}: {v}" for k, v in per.items()))
    if excluded:
        print(f"EXCLUDED {len(excluded)} event(s) — review, not published:")
        for d, t, r in excluded:
            print(f"  {d}  {t}  [{r}]")
    else:
        print("Excluded: none")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
