#!/usr/bin/env bash
set -euo pipefail

# check-rovo-session-identity-log.sh — Grade a Rovo session-identity diagnostic log.
#
# Parses the diagnostic log, groups entries by run label, and prints one verdict per run plus cross-run checks:
#   PASS               — one id across every checkpoint of the run
#   RECALL DRIFT       — fetched ids agree but a recalled id diverged
#   PLATFORM UNSTABLE  — fetched ids within the run disagree
#   DISCIPLINE         — an ansN checkpoint without its askN (end-of-turn skip)
#   COLLISION          — the same id under two run labels (distinctness failure)
# Raw response lines are echoed last for shape review across runs and dates.
#
# Usage:
#   check-rovo-session-identity-log.sh [--log FILE]
#   check-rovo-session-identity-log.sh --help

readonly PROG="$(basename "$0")"
readonly DEFAULT_OUTPUT_DIR="$HOME/.codeassembly/diagnostics"
readonly LOG_BASENAME="rovo-session-diagnostic.log"

# Main flow
main() {
  local log_file="$DEFAULT_OUTPUT_DIR/$LOG_BASENAME"

  # Parse options
  while [[ $# -gt 0 ]]; do
    case "$1" in
    --log=*) log_file="${1#*=}" ;;
    --log)
      log_file="${2:?$PROG: --log requires a value}"
      shift
      ;;
    --output-dir=*) log_file="${1#*=}/$LOG_BASENAME" ;;
    --output-dir)
      log_file="${2:?$PROG: --output-dir requires a value}/$LOG_BASENAME"
      shift
      ;;
    -h | --help) show_usage 0 ;;
    *)
      echo "$PROG: Unknown argument $1" >&2
      show_usage
      ;;
    esac
    shift
  done

  # Validate arguments
  if [[ ! -f "$log_file" ]]; then
    echo "$PROG: Log file not found: $log_file" >&2
    echo "Run the diagnostic first, or pass the log's location with --log" >&2
    exit 1
  fi

  grade_log "$log_file"

  echo
  echo "Raw responses (compare field names across runs and dates):"
  grep 'kind=raw' "$log_file" || echo "  (none logged)"
}

# region | Helper functions

# Parses the log and prints per-run verdicts and cross-run checks.
grade_log() {
  local log_file="$1"
  awk '
    {
      run = ""; cp = ""; kind = ""; id = ""
      for (i = 1; i <= NF; i++) {
        if ($i ~ /^run=/) run = substr($i, 5)
        else if ($i ~ /^cp=/) cp = substr($i, 4)
        else if ($i ~ /^kind=/) kind = substr($i, 6)
        else if ($i ~ /^id=/) id = substr($i, 4)
      }
      if (run == "" || kind == "" || kind == "raw") next

      runs[run] = 1
      total[run]++
      if (!((run, id) in seen_id)) { seen_id[run, id] = 1; id_count[run]++ }
      if (kind == "fetched" && !((run, id) in seen_fetched)) {
        seen_fetched[run, id] = 1
        fetched_count[run]++
      }
      if (cp ~ /^ask/) asks[run, substr(cp, 4)] = 1
      if (cp ~ /^ans/) answers[run, substr(cp, 4)] = 1
      if (!(id in id_owner)) id_owner[id] = run
      else if (id_owner[id] != run) collisions[id] = 1
    }
    END {
      if (length(runs) == 0) {
        print "No diagnostic entries found."
        exit 0
      }
      for (r in runs) {
        verdict = sprintf("PASS               one id across %d checkpoints", total[r])
        if (fetched_count[r] > 1)
          verdict = "PLATFORM UNSTABLE  fetched ids within the run disagree"
        else if (id_count[r] > 1)
          verdict = "RECALL DRIFT       fetched ids agree; a recalled id diverged"
        printf "run=%-28s %s\n", r, verdict
      }
      for (key in answers) {
        split(key, parts, SUBSEP)
        if (!((parts[1], parts[2]) in asks))
          printf "DISCIPLINE         run=%s logged ans%s without ask%s (end-of-turn emit skipped)\n", parts[1], parts[2], parts[2]
      }
      for (id in collisions)
        printf "COLLISION          id=%s appears under more than one run label\n", id
    }
  ' "$log_file"
}

# Displays command-line syntax. Can exit with or without an error code.
show_usage() {
  cat >&2 <<USAGE
Grade a Rovo session-identity diagnostic log.

Usage:
  $PROG [--log FILE]
  $PROG --help

Options:
  --log FILE        Diagnostic log file (default:
                    ~/.codeassembly/diagnostics/rovo-session-diagnostic.log)
  --output-dir DIR  Directory holding the log under its default basename;
                    match the launcher's --output-dir
  -h, --help        Show this help

Examples:
  $PROG
  $PROG --output-dir /tmp/rovo-diag
USAGE
  exit "${1:-1}"
}
# endregion | Helper functions

main "$@"
