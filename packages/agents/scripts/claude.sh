#!/usr/bin/env bash
set -euo pipefail

# claude.sh — Launch Claude Code with a PROJECT.md staleness check.
#
# Runs check-project-staleness.sh to warn if .agents/PROJECT.md is out of
# date, then execs into claude with all arguments forwarded.
#
# Usage:
#   claude.sh [args...]
#   claude.sh --help

readonly PROG="$(basename "$0")"

# Main flow
main() {
  # Handle launcher flags before forwarding to claude.
  # Use -- to pass flags like -h directly to claude: claude.sh -- -h
  case "${1:-}" in
  -h | --help) show_usage 0 ;;
  --) shift ;;
  esac

  # Check dependencies
  if ! command -v claude &>/dev/null; then
    echo "$PROG: required command 'claude' not found" >&2
    exit 127
  fi

  # Resolve the directory containing this script, following symlinks
  local script_dir
  script_dir="$(resolve_script_dir)"

  # Run the staleness check (non-blocking — always exits 0)
  "$script_dir/check-project-staleness.sh"

  exec claude "$@"
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
Launch Claude Code with a PROJECT.md staleness check.

Checks whether .agents/PROJECT.md is out of date and prints a warning if
so, then launches claude with all arguments forwarded.

Usage:
  $PROG [args...]
  $PROG --help
  $PROG -- [args passed directly to claude]

Options:
  -h, --help   Show this help
  --           Stop processing launcher flags; forward remaining args to claude

Dependencies:
  claude       Claude Code CLI

Examples:
  $PROG
  $PROG --resume
  $PROG -- --help          # Show claude's help, not the launcher's
USAGE
  exit "${1:-1}"
}
# endregion | Helper functions

main "$@"
