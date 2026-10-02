# Sync Systems Training from Drive

Canonical Drive files:

- `Martin Dashboard/systems-training/progress.json`
- `Martin Dashboard/systems-training/sessions/{session_id}.json`

Mirror pulled onto the box:

- `data/systems-training/`

After pulling the files into the mirror, run from the repository root:

```sh
python3 scripts/ingest_training.py
scripts/build_dist.sh
```

The ingest is local and idempotent; it does not call the Drive API.
