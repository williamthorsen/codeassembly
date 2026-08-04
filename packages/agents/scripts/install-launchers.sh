#!/usr/bin/env bash
set -euo pipefail

# install-launchers.sh — Symlink agent launcher scripts into a directory on PATH.
#
# Creates a symlink for feedback-memories.sh in the target directory. Uses
# symlinks so that pulling repo updates automatically updates the installed
# scripts.
#
# Usage:
#   install-launchers.sh [--prefix DIR] [--force]
#   install-launchers.sh --help

readonly PROG="$(basename "$0")"
readonly DEFAULT_PREFIX="/usr/local/bin"
readonly SCRIPTS=(feedback-memories.sh)

# Main flow
main() {
  # Show help (manual check — getopts cannot parse long options)
  if [[ "${1:-}" == "--help" ]]; then
    show_usage 0
  fi

  # Parse options
  local prefix="$DEFAULT_PREFIX"
  local force=false
  while [[ $# -gt 0 ]]; do
    case "$1" in
    --prefix=*) prefix="${1#*=}" ;;
    --prefix)
      prefix="${2:-}"
      shift
      ;;
    --force) force=true ;;
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

  if [[ -z "$prefix" ]]; then
    echo "$PROG: --prefix requires a directory path" >&2
    show_usage
  fi

  # Resolve the directory containing the source scripts
  local script_dir
  script_dir="$(resolve_script_dir)"

  # Validate the target directory exists
  if [[ ! -d "$prefix" ]]; then
    echo "$PROG: target directory does not exist: $prefix" >&2
    echo "Create it first or choose a different --prefix" >&2
    exit 1
  fi

  # Install each script
  local installed=0 skipped=0 updated=0
  for script in "${SCRIPTS[@]}"; do
    local source="$script_dir/$script"
    local target="$prefix/$script"

    if [[ ! -f "$source" ]]; then
      echo "$PROG: source script not found: $source" >&2
      exit 1
    fi

    if [[ -L "$target" ]]; then
      local existing_target
      existing_target="$(readlink "$target")"
      if [[ "$existing_target" == "$source" ]]; then
        echo "  ok  $script (already up to date)"
        continue
      fi
      # Symlink exists but points elsewhere — update it
      ln -sf "$source" "$target"
      echo "  ok  $script (updated symlink)"
      ((updated++)) || true
    elif [[ -e "$target" ]]; then
      if [[ "$force" == true ]]; then
        rm "$target"
        ln -s "$source" "$target"
        echo "  ok  $script (replaced existing file)"
        ((updated++)) || true
      else
        echo "  skip $script (exists at $target and is not a symlink; use --force to replace)"
        ((skipped++)) || true
        continue
      fi
    else
      ln -s "$source" "$target"
      echo "  ok  $script (created)"
      ((installed++)) || true
    fi
  done

  echo ""
  echo "Installed to $prefix: $installed created, $updated updated, $skipped skipped"

  if [[ $skipped -gt 0 ]]; then
    echo "Re-run with --force to replace skipped files" >&2
  fi
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
Symlink agent launcher scripts into a directory on PATH.

Creates a symlink for feedback-memories.sh in the target directory. Uses
symlinks so that pulling repo updates automatically updates the installed
scripts.

Usage:
  $PROG [--prefix DIR] [--force]
  $PROG --help

Options:
  --prefix DIR  Target directory for symlinks (default: $DEFAULT_PREFIX)
  --force       Replace existing non-symlink files
  -h, --help    Show this help

Examples:
  $PROG
  $PROG --prefix ~/.local/bin
  $PROG --force
USAGE
  exit "${1:-1}"
}
# endregion | Helper functions

main "$@"
