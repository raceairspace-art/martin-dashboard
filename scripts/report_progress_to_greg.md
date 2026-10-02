# Report progress to Greg (`learner_progress_report`)

After Michael submits the knowledge-check quiz (and optionally a scenario draft),
Martin builds a **`learner_progress_report`** payload, persists it (localStorage +
downloadable JSON shaped for `data/systems-training/learner_reports/`), and can
**SendToAgent Greg** with that body.

## Trigger

- Training module → Knowledge check → **Submit quiz**
- Optional: scenario draft already saved in localStorage is included

## Payload schema

```json
{
  "schema_version": "1.0",
  "type": "learner_progress_report",
  "bot_id": "martin_dashboard",
  "emitted_at": "2026-10-02T13:00:00-07:00",
  "session_id": "phase1-session01",
  "phase": { "id": 1, "name": "Modern Application Architecture" },
  "topic": { "id": "api-as-contract", "title": "API as architectural contract" },
  "scores": {
    "overall_pct": 72,
    "knowledge_check_estimate": 0.72,
    "per_question": [
      {
        "id": "q1",
        "estimate": 0.8,
        "matched_rubric": ["central auth, rate limits, WAF integration"],
        "missed_rubric": ["TLS / certificate / routing ownership"]
      }
    ]
  },
  "weak_areas": [
    "TLS / certificate / routing ownership",
    "prefer queue/async with retry/DLQ for durable business events"
  ],
  "strengths": [
    "central auth, rate limits, WAF integration"
  ],
  "learner_answers": {
    "knowledge_check": [
      { "id": "q1", "question": "…", "answer": "…" }
    ],
    "scenario": {
      "id": "hr-lms-outbound",
      "answer": "… or null if not drafted"
    },
    "interactive_teach": [
      { "id": "authn_vs_authz", "answer": "Authorization" }
    ]
  },
  "learner_answers_summary": "Quiz 4/4 answered · estimate 72% · scenario draft: yes/no · weak: …",
  "progress_hint": {
    "status": "quiz_submitted",
    "awaiting": "greg_critique",
    "home_badge": "Quiz submitted — waiting on Greg critique"
  }
}
```

### Required fields for SendToAgent

| Field | Notes |
|-------|--------|
| `type` | Always `learner_progress_report` |
| `session_id` | Matches Greg session file stem |
| `scores` | Overall + per-question estimates (rubric keyword overlap; not graded by Greg) |
| `weak_areas` | Rubric points with low/no match across answers |
| `learner_answers` / `learner_answers_summary` | Full answers + one-line summary for chat |

## Persistence

1. **localStorage** key `martin-training-learner-reports` (array of reports)
2. **Download** `learner_progress_report-{session_id}-{timestamp}.json` (Michael / Martin can drop into Drive or box)
3. **Box path for ingest:** `data/systems-training/learner_reports/{session_id}-{timestamp}.json`
4. UI **Copy report for Greg** → clipboard JSON for pasting into an agent ping

## SendToAgent Greg (Martin ops)

Message intent: “Michael submitted Session {session_id} knowledge check.”  
Attach or paste the JSON body above. Greg owns critique + progress.json updates;
Martin only mirrors.

## Scoring note

Dashboard scores are **estimates** from rubric_points token overlap so Michael gets
immediate feedback. Greg’s critique remains authoritative.
