#!/usr/bin/env bash
# Drive sync is performed by the caller; this script only documents the paths
# and projects the already-pulled local mirror.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
echo "Drive: Martin Dashboard/systems-training/progress.json"
echo "Drive: Martin Dashboard/systems-training/sessions/{session_id}.json"
echo "Mirror: $ROOT/data/systems-training/"
cd "$ROOT"
python3 scripts/ingest_training.py
scripts/build_dist.sh
