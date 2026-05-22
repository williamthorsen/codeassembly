#!/usr/bin/env bash
set -euo pipefail

BREADCRUMB=".claude/tmp/active-run-dir"
[ -f "$BREADCRUMB" ] || exit 0

RUN_DIR=$(cat "$BREADCRUMB")
LOG_FILE="$RUN_DIR/run-log.jsonl"
[ -f "$LOG_FILE" ] || exit 0

INPUT=$(cat)
REASON=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('notification_type',''))" 2>/dev/null || echo "")

case "$REASON" in
permission_prompt | elicitation_dialog | idle_prompt) ;;
*) exit 0 ;;
esac

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
echo "{\"t\":\"$TIMESTAMP\",\"event\":\"waiting_for_input\",\"reason\":\"$REASON\"}" >>"$LOG_FILE"
