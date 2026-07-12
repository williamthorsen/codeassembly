#!/usr/bin/env bash
set -euo pipefail

# feedback-memories.sh — Run the feedback-memories toolbox from the repo source.
#
# A thin launcher: it resolves the monorepo root from this script's (possibly
# symlinked) location and runs the toolbox CLI via tsx, forwarding every
# argument. Running the TypeScript source directly means the command tracks the
# checkout with no rebuild. All verbs, flags, and the --help text belong to the
# CLI; this script forwards everything to it.
#
# Usage:
#   feedback-memories.sh list [--memory-store <name>] [--verbose]
#   feedback-memories.sh --help

readonly PROG="$(basename "$0")"

# Main flow
main() {
  # Resolve the monorepo root from this script's location, then locate tsx and the toolbox entry point.
  local script_dir repo_root tsx_bin cli_entry
  script_dir="$(resolve_script_dir)"
  repo_root="$(cd "$script_dir/../../.." && pwd)"
  tsx_bin="$repo_root/node_modules/.bin/tsx"
  cli_entry="$repo_root/packages/agents/src/feedback-memories/cli.ts"

  # Check dependencies
  if [[ ! -x "$tsx_bin" ]]; then
    echo "$PROG: tsx not found at $tsx_bin" >&2
    echo "Run 'pnpm install' at the monorepo root first" >&2
    exit 127
  fi
  if [[ ! -f "$cli_entry" ]]; then
    echo "$PROG: toolbox source not found at $cli_entry" >&2
    exit 1
  fi

  exec "$tsx_bin" "$cli_entry" "$@"
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
# endregion | Helper functions

main "$@"
