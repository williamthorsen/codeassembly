#!/usr/bin/env bash
set -euo pipefail

# check-project-staleness.sh — Check whether .agents/PROJECT.md is out of date.
#
# Compares the last-modified commit date of .agents/PROJECT.md against recent
# commits, filtering out commits that only touch package manifests and lock
# files. If the number of meaningful commits exceeds a threshold, prints a
# warning to stderr.
#
# Always exits 0 — the check is informational, never blocking.
#
# Usage:
#   check-project-staleness.sh [--threshold N]
#   check-project-staleness.sh --help

readonly PROG="$(basename "$0")"
readonly DEFAULT_THRESHOLD=20
readonly PROJECT_MD=".agents/PROJECT.md"

# Main flow
main() {
  # Show help (manual check — getopts cannot parse long options)
  if [[ "${1:-}" == "--help" ]]; then
    show_usage 0
  fi

  # Parse options
  local threshold="$DEFAULT_THRESHOLD"
  while [[ $# -gt 0 ]]; do
    case "$1" in
    --threshold=*) threshold="${1#*=}" ;;
    --threshold)
      threshold="${2:-}"
      shift
      ;;
    --) ;;
    -h) show_usage 0 ;;
    -*)
      echo "$PROG: unknown option $1" >&2
      show_usage
      ;;
    *)
      echo "$PROG: unexpected argument $1" >&2
      show_usage
      ;;
    esac
    shift
  done

  if ! [[ "$threshold" =~ ^[0-9]+$ ]]; then
    echo "$PROG: threshold must be a positive integer, got '$threshold'" >&2
    show_usage
  fi

  # Bail silently if not in a git repo
  local repo_root
  repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0

  # Bail silently if PROJECT.md does not exist
  [[ -f "$repo_root/$PROJECT_MD" ]] || exit 0

  # Bail silently if PROJECT.md has no git history
  local last_modified_epoch
  last_modified_epoch="$(git log -1 --format=%ct -- "$PROJECT_MD" 2>/dev/null)" || exit 0
  [[ -n "$last_modified_epoch" ]] || exit 0

  # Count meaningful commits since the last modification.
  # Use git log --name-only in a single pass, parsed by awk to exclude
  # commits that only touch package manifests and lock files.
  local meaningful_count
  meaningful_count="$(count_meaningful_commits "$last_modified_epoch")"

  if [[ "$meaningful_count" -ge "$threshold" ]]; then
    local formatted_date relative_time
    formatted_date="$(format_utc_date "$last_modified_epoch")"
    relative_time="$(compute_relative_time "$last_modified_epoch")"

    cat >&2 <<MSG
⚠️ PROJECT.md may be stale:
  Last updated: $formatted_date ($relative_time)
  Since then:   $meaningful_count commits
  Run /update-project-guidance to refresh it
MSG
  fi

  exit 0
}

# region | Helper functions

# Count commits since an epoch timestamp, excluding those that only touch package/lock files.
count_meaningful_commits() {
  local since_epoch="$1"

  # Produce a stream of "COMMIT\n<file1>\n<file2>\n..." blocks.
  # Awk counts commits where at least one file is NOT a package/lock file.
  git log --pretty="format:COMMIT" --name-only --after="@$since_epoch" HEAD 2>/dev/null |
    awk '
    /^COMMIT$/ {
      if (NR > 1 && has_meaningful) count++
      has_meaningful = 0
      next
    }
    /^$/ { next }
    {
      # Check if this file is a package manifest or lock file
      if ($0 !~ /(^|\/)package\.json$/ &&
          $0 !~ /(^|\/)pnpm-lock\.yaml$/ &&
          $0 !~ /(^|\/)package-lock\.json$/ &&
          $0 !~ /(^|\/)yarn\.lock$/) {
        has_meaningful = 1
      }
    }
    END {
      if (has_meaningful) count++
      print count + 0
    }
    '
}

# Format a Unix epoch as "YYYY-MM-DD HH:MM UTC".
format_utc_date() {
  local epoch="$1"
  # Use date -r on macOS (BSD), fall back to date -d on Linux (GNU)
  if date -r "$epoch" -u "+%Y-%m-%d %H:%M UTC" 2>/dev/null; then
    return
  fi
  date -d "@$epoch" -u "+%Y-%m-%d %H:%M UTC" 2>/dev/null || echo "unknown"
}

# Compute a human-friendly relative time string from a Unix epoch.
compute_relative_time() {
  local epoch="$1"
  local now
  now="$(date +%s)"
  local diff=$((now - epoch))

  if [[ $diff -lt 60 ]]; then
    echo "just now"
  elif [[ $diff -lt 3600 ]]; then
    local mins=$((diff / 60))
    if [[ $mins -eq 1 ]]; then echo "1 minute ago"; else echo "$mins minutes ago"; fi
  elif [[ $diff -lt 86400 ]]; then
    local hours=$((diff / 3600))
    if [[ $hours -eq 1 ]]; then echo "1 hour ago"; else echo "$hours hours ago"; fi
  elif [[ $diff -lt 2592000 ]]; then
    local days=$((diff / 86400))
    if [[ $days -eq 1 ]]; then echo "1 day ago"; else echo "$days days ago"; fi
  elif [[ $diff -lt 31536000 ]]; then
    local months=$((diff / 2592000))
    if [[ $months -eq 1 ]]; then echo "1 month ago"; else echo "$months months ago"; fi
  else
    local years=$((diff / 31536000))
    if [[ $years -eq 1 ]]; then echo "1 year ago"; else echo "$years years ago"; fi
  fi
}

# Display command-line syntax.
show_usage() {
  cat >&2 <<USAGE
Check whether .agents/PROJECT.md is out of date.

Counts meaningful commits since the last modification of PROJECT.md,
filtering out commits that only touch package manifests and lock files.
Prints a warning to stderr if the count exceeds the threshold.

Always exits 0 — the check is informational, never blocking.

Usage:
  $PROG [--threshold N]
  $PROG --help

Options:
  --threshold N  Number of commits before warning (default: $DEFAULT_THRESHOLD)
  -h, --help     Show this help

Examples:
  $PROG
  $PROG --threshold 10
USAGE
  exit "${1:-1}"
}
# endregion | Helper functions

main "$@"
