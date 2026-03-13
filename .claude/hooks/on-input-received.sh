#!/usr/bin/env bash
set -euo pipefail

BREADCRUMB=".claude/tmp/active-run-dir"
[ -f "$BREADCRUMB" ] || exit 0

RUN_DIR=$(cat "$BREADCRUMB")
LOG_FILE="$RUN_DIR/run-log.jsonl"
[ -f "$LOG_FILE" ] || exit 0

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
echo "{\"t\":\"$TIMESTAMP\",\"event\":\"input_received\"}" >> "$LOG_FILE"
