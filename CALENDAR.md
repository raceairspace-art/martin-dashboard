# Calendar tab

`#/calendar` (current month in America/Los_Angeles) and `#/calendar/YYYY-MM` for any
baked month. Titles only. A seasonal theme is picked from the month number
(`modules/calendar/themes.js`, 12 themes) so the look changes automatically.

## What is published (privacy)

`data/calendar/events.json` → copied by `scripts/build_dist.sh` to `dist/data/calendar/events.json`:

```json
{ "generated_at": "...", "timezone": "America/Los_Angeles", "end_is_inclusive": true,
  "months": ["2026-10", "2026-11", "2026-12", "2027-01"],
  "events": [ { "title": "...", "start": "YYYY-MM-DD", "end": "YYYY-MM-DD", "all_day": true } ] }
```

Nothing else: no times, descriptions, locations, attendees, links or event ids.
`end` is the **inclusive** last day (Google's exclusive all-day end minus one day;
timed events are converted to LA dates, and an end at exactly midnight counts as the previous day).

`scripts/ingest_calendar.py` drops, and prints for review (never writes to disk):
cancelled, private/confidential, declined events, and titles matching a
sensitive-keyword list (medical, financial, legal, private appointments…).
Raw connector dumps contain private fields — keep them **outside the repo**
(e.g. `/workspace/calendar-raw/`), never commit or bake them.

## Daily refresh procedure

1. Fetch (read-only) with the Google Calendar connector:
   `CallDynamicTool` namespace `user-Google-calendar`, tool `list_events`, `write_to_file: true`, arguments:
   ```json
   {"calendarId": "primary", "timeZone": "America/Los_Angeles", "maxResults": 250,
    "startTime": "<1st of previous month>T00:00:00<LA offset>",
    "endTime":   "<1st of the month after next+1>T00:00:00<LA offset>"}
   ```
   e.g. on 2026-11-03: `2026-10-01T00:00:00-07:00` → `2027-02-01T00:00:00-08:00`.
   If the result has `nextPageToken`, call again with `pageToken` and keep every page file.
2. Copy the result file(s) to `/workspace/calendar-raw/raw-YYYY-MM-DD[-pN].txt` (outside the repo).
3. `python3 scripts/ingest_calendar.py --raw /workspace/calendar-raw/raw-YYYY-MM-DD.txt [--raw ...p2.txt]`
   — writes `data/calendar/events.json`, prints per-month counts and any EXCLUDED titles.
4. `bash scripts/build_dist.sh`
5. `git add data/calendar/events.json && git commit -m "Calendar refresh YYYY-MM-DD" && git push origin main` (normal push).
6. Publish `dist/` to `gh-pages` the usual way (fresh /tmp clone of gh-pages, replace contents, `.nojekyll`, commit, push).
7. Verify `https://raceairspace-art.github.io/martin-dashboard/#/calendar` after the Pages lag.

The window (previous month → next two months) is computed by the script from today's LA
date; `--today YYYY-MM-DD` overrides it for testing.
