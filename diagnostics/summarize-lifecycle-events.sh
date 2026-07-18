#!/usr/bin/env bash
set -euo pipefail

# summarize-lifecycle-events.sh — Summarize a lifecycle-event log for spike evidence.
#
# Reads every session JSONL under the events root and prints the evidence
# counts the fleet-view spike's exit criteria ask for: events by harness and
# type, skill runs per skill per harness, lanes with multiple sessions, lanes
# with mixed harnesses, and the covered date range. Read-only; run on each
# machine and share the output through the diagnostics/evidence/ drop
# directory.
#
# By default, lane identities (owner/repo/branch paths) are redacted to
# stable anonymous labels so the output is safe to commit from a machine
# whose repository names must not leave it. Pass --full to print real lane
# names for local inspection only.
#
# Usage:
#   summarize-lifecycle-events.sh [--full] [events-root]
#   summarize-lifecycle-events.sh --help

readonly PROG="$(basename "$0")"
readonly DEFAULT_ROOT="$HOME/.codeassembly/events"

# Main flow
main() {
  local events_root="$DEFAULT_ROOT"
  local redact=true

  # Parse options
  while [[ $# -gt 0 ]]; do
    case "$1" in
    --full) redact=false ;;
    -h | --help) show_usage 0 ;;
    -*)
      echo "$PROG: Unknown option $1" >&2
      show_usage
      ;;
    *) events_root="$1" ;;
    esac
    shift
  done

  # Check dependencies
  if ! command -v jq &>/dev/null; then
    echo "$PROG: Required command 'jq' not found" >&2
    exit 127
  fi

  # Validate arguments
  if [[ ! -d "$events_root" ]]; then
    echo "$PROG: Events root not found: $events_root" >&2
    exit 1
  fi

  # Build the lane-redaction map (stable within one run), ordered longest lane
  # first so a lane that is a substring of another is never replaced first
  local lane_map
  lane_map=$(mktemp)
  # Expand the path now: the trap fires after this function's locals are gone
  trap "rm -f '$lane_map'" EXIT
  list_lane_of_each_session "$events_root" | sort -u | awk '{print $0 "\tlane-" NR}' \
    | awk -F'\t' '{print length($1) "\t" $0}' | sort -rn | cut -f2- > "$lane_map"

  local file_count
  file_count=$(find "$events_root" -name '*.jsonl' | wc -l | tr -d ' ')
  echo "== session files: $file_count"
  if $redact; then
    echo "== lane names redacted (stable labels; rerun with --full locally for real names)"
  else
    echo "== events root: $events_root (lane names NOT redacted — do not commit)"
  fi

  echo
  echo "== date range"
  concat_events "$events_root" | jq -rs 'map(.ts) | (min // "n/a") + "  ->  " + (max // "n/a")'

  echo
  echo "== events by harness"
  concat_events "$events_root" | jq -r '.harness // "absent"' | sort | uniq -c | sort -rn

  echo
  echo "== events by type"
  concat_events "$events_root" | jq -r .type | sort | uniq -c | sort -rn

  echo
  echo "== skill.started runs by harness and skill"
  concat_events "$events_root" \
    | jq -r 'select(.type == "skill.started") | (.harness // "?") + "  " + (.payload.skill // "?")' \
    | sort | uniq -c | sort -rn

  echo
  echo "== lanes with more than one session"
  list_lane_of_each_session "$events_root" | sort | uniq -c | sort -rn | awk '$1 > 1' \
    | redact_lanes "$redact" "$lane_map"

  echo
  echo "== harnesses per lane (a lane listing two harnesses is mixed-harness evidence)"
  find "$events_root" -name '*.jsonl' | while read -r file; do
    lane=$(lane_of "$events_root" "$file")
    jq -r --arg lane "$lane" '($lane) + "  " + (.harness // "absent")' "$file"
  done | sort -u | awk '{lanes[$1] = lanes[$1] " " $2} END {for (l in lanes) print l ":" lanes[l]}' | sort \
    | redact_lanes "$redact" "$lane_map"
}

# region | Helper functions

# Streams every event object from every session file under the root.
concat_events() {
  find "$1" -name '*.jsonl' -print0 | xargs -0 cat
}

# Prints the lane (repo/branch path) that contains the given session file.
lane_of() {
  local root="$1" file="$2"
  dirname "${file#"$root"/}"
}

# Prints one lane line per session file.
list_lane_of_each_session() {
  local root="$1" file
  find "$root" -name '*.jsonl' | while read -r file; do
    lane_of "$root" "$file"
  done
}

# Replaces real lane paths on stdin with their stable labels from the map
# file; passes text through unchanged when redaction is off.
redact_lanes() {
  local redact="$1" lane_map="$2"
  if [[ "$redact" != "true" ]]; then
    cat
    return
  fi
  awk -v map_file="$lane_map" '
    BEGIN {
      n = 0
      while ((getline line < map_file) > 0) {
        tab = index(line, "\t")
        n++
        lanes[n] = substr(line, 1, tab - 1)
        labels[n] = substr(line, tab + 1)
      }
      close(map_file)
    }
    {
      for (i = 1; i <= n; i++) {
        idx = index($0, lanes[i])
        while (idx > 0) {
          $0 = substr($0, 1, idx - 1) labels[i] substr($0, idx + length(lanes[i]))
          idx = index($0, lanes[i])
        }
      }
      print
    }
  '
}

# Displays command-line syntax. Can exit with or without an error code.
show_usage() {
  cat >&2 <<USAGE
Summarize a lifecycle-event log for spike evidence.

Usage:
  $PROG [--full] [events-root]
  $PROG --help

Arguments:
  events-root   Directory holding the event log (default: ~/.codeassembly/events)

Options:
  --full        Print real lane names instead of stable redacted labels.
                For local inspection only; do not commit --full output from a
                machine whose repository names must not leave it
  -h, --help    Show this help

Dependencies:
  jq            Parses the event JSONL

Examples:
  $PROG > diagnostics/evidence/work-events-summary.txt
  $PROG --full
USAGE
  exit "${1:-1}"
}
# endregion | Helper functions

main "$@"
