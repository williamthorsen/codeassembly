#!/usr/bin/env bash
set -euo pipefail

# test-sh.sh — Run shellspec against the package's shell tests.
#
# Forwards positional arguments to shellspec, falling back to the package's default test directory
# when no paths or options are supplied.
# Drops a single leading `--` so callers can use the standard `pnpm <script> -- <args>` convention
# to forward shellspec flags such as `--example`.
#
# Usage:
#   test-sh.sh                      # run all tests under content/scripts/
#   test-sh.sh path/to/test.sh      # run a specific test file
#   test-sh.sh -- --example PAT     # forward shellspec flags
#   test-sh.sh --help

readonly PROG="$(basename "$0")"

main() {
  if [[ "${1:-}" == "--help" ]]; then
    show_usage 0
  fi

  # Consume the pnpm `--` separator if present so subsequent args reach
  # shellspec as real options rather than positional paths.
  if [[ "${1:-}" == "--" ]]; then
    shift
  fi

  exec shellspec "${@:-content/scripts/}"
}

show_usage() {
  cat >&2 <<USAGE
Run shellspec against the package's shell tests.

Usage:
  $PROG [shellspec-args...]
  $PROG --help

When invoked with no arguments, runs all tests under content/scripts/. When
invoked with arguments, forwards them to shellspec (after consuming a single
leading \`--\` separator added by pnpm).

Examples:
  $PROG
  $PROG content/scripts/__tests__/get_ticket_id_test.sh
  $PROG -- --example snake_case
USAGE
  exit "${1:-1}"
}

main "$@"
