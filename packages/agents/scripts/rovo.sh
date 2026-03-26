#!/usr/bin/env bash
set -euo pipefail

# rovo.sh — Launch Rovo Dev with a PROJECT.md staleness check.
#
# Runs check-project-staleness.sh to warn if .agents/PROJECT.md is out of
# date, then execs into acli rovodev run with all arguments forwarded.
#
# Usage:
#   rovo.sh [args...]
#   rovo.sh --help

readonly PROG="$(basename "$0")"

# Main flow
main() {
  # Show help (manual check — getopts cannot parse long options)
  if [[ "${1:-}" == "--help" ]]; then
    show_usage 0
  fi

  # Check dependencies
  if ! command -v acli &>/dev/null; then
    echo "$PROG: required command 'acli' not found" >&2
    exit 127
  fi

  # Resolve the directory containing this script, following symlinks
  local script_dir
  script_dir="$(resolve_script_dir)"

  # Run the staleness check (non-blocking — always exits 0)
  "$script_dir/check-project-staleness.sh"

  exec acli rovodev run "$@"
}

# region | Helper functions

# Resolve the directory of this script, following symlinks.
resolve_script_dir() {
  local source="$0"
  [[ "$source" != */* ]] && source="$(command -v "$0")"

  # Follow symlinks (portable — works on macOS and Linux)
  while [[ -L "$source" ]]; do
    local link_target
    link_target="$(readlink "$source")"
    if [[ "$link_target" == /* ]]; then
      source="$link_target"
    else
      source="$(dirname "$source")/$link_target"
    fi
  done

  (cd "$(dirname "$source")" && pwd)
}

# Display command-line syntax.
show_usage() {
  cat >&2 <<USAGE
Launch Rovo Dev with a PROJECT.md staleness check.

Checks whether .agents/PROJECT.md is out of date and prints a warning if
so, then launches acli rovodev run with all arguments forwarded.

Usage:
  $PROG [args...]
  $PROG --help

Options:
  -h, --help   Show this help

Dependencies:
  acli         Atlassian CLI

Examples:
  $PROG
  $PROG --yolo
USAGE
  exit "${1:-1}"
}
# endregion | Helper functions

main "$@"
