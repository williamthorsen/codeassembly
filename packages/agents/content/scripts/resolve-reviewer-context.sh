#!/usr/bin/env bash
# Assemble the reviewer-context block inlined under `## Reviewer context` in
# every reviewer prompt. Combines two independent sources:
#
#   1. A coder-emitted sidecar artifact (`*_coder_reviewer-context.md`),
#      written when the implementation phase investigated a third-party API
#      surface that surprised the coder.
#   2. A static lookup table (markdown with `## <package-name>` sections)
#      keyed on npm package identifiers that are known to confuse reviewers.
#
# Usage:
#   resolve-reviewer-context.sh \
#     [--sidecar PATH] \
#     --changed-files FILE \
#     --lookup PATH
#   resolve-reviewer-context.sh --help
#
# Output (stdout): markdown block ready to inline directly under the
# reviewer prompt's `## Reviewer context` heading. Empty when neither
# source produces content. The script never emits the `## Reviewer
# context` heading itself — the orchestrator wraps the output and skips
# the wrapping when the output is empty.
#
# Logic:
#   - Sidecar (if non-empty file): print as-is followed by a blank line.
#   - Lookup: parse sections by `^## ` headers; for each lookup key, scan
#     the changed-file list for any matching `import` / `require` of that
#     package. Emit matched sections in lookup-table declaration order.
#
# Match scope: only files with extensions `.ts`, `.tsx`, `.js`, `.jsx`,
# `.mts`, `.cts`, `.mjs`, `.cjs` are scanned. Files listed in
# `--changed-files` that no longer exist in the working tree (e.g.,
# deleted) are silently skipped.
#
# Match patterns (intentionally narrow — static imports/requires only):
#   - import ... from 'pkg' / "pkg"
#   - import ... from 'pkg/subpath' / "pkg/subpath"
#   - require('pkg') / require("pkg")
#   - require('pkg/subpath') / require("pkg/subpath")
# Subpath imports (e.g., `pkg/lib`) match the bare-key entry — the gotcha
# usually lives in or near the subpath. Dynamic imports (`await
# import('pkg')`), rebound names, and re-exports are not matched. v1
# acceptable: any single static reference is enough signal that the
# package is in scope.
#
# Exit codes:
#   0  Normal — content emitted (or empty stdout when nothing matched).
#   1  Usage error (missing/unknown flag) or unreadable required input.

set -euo pipefail
# Propagate failures from command substitutions ($(...)) under `set -e`.
shopt -s inherit_errexit

readonly PROG="$(basename "$0")"

sidecar=""
changed_files=""
lookup=""

# Parse CLI flags into the script-scope globals above. Resets every variable
# so repeated invocations under test start from a clean slate.
parse_args() {
  sidecar=""
  changed_files=""
  lookup=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
    --sidecar)
      sidecar="$2"
      shift 2
      ;;
    --changed-files)
      changed_files="$2"
      shift 2
      ;;
    --lookup)
      lookup="$2"
      shift 2
      ;;
    -h | --help)
      show_usage 0
      ;;
    *)
      echo "$PROG: unknown option: $1" >&2
      show_usage
      ;;
    esac
  done
}

# Show command-line syntax. Exits with the supplied code (default 1) so
# callers can pass `0` for explicit `--help`, or call bare for usage errors.
show_usage() {
  local stream=2
  if [[ "${1:-}" == "0" ]]; then
    stream=1
  fi
  cat >&"$stream" <<USAGE
Assemble the reviewer-context block for a single reviewer dispatch.

Usage:
  $PROG [--sidecar PATH] --changed-files FILE --lookup PATH
  $PROG --help

Options:
  --sidecar PATH         Optional. Coder-emitted reviewer-context sidecar
                         artifact. Inlined verbatim when non-empty.
  --changed-files FILE   Required. Line-delimited list of changed file
                         paths (relative to repo root). Used to scan
                         imports against the lookup table.
  --lookup PATH          Required. Path to the lookup table markdown file
                         (sections delimited by '## <package-name>').
  -h, --help             Show this help.

Output:
  Markdown block on stdout, ready to inline under the reviewer prompt's
  '## Reviewer context' heading. Empty when neither source produces
  content. The orchestrator wraps the output; the wrapping is skipped
  when the output is empty.
USAGE
  exit "${1:-1}"
}

# Test whether a file path has a JS/TS extension worth scanning for imports.
# Acceptable: .ts .tsx .js .jsx .mts .cts .mjs .cjs.
is_scannable_extension() {
  local path="$1"
  case "$path" in
  *.ts | *.tsx | *.js | *.jsx | *.mts | *.cts | *.mjs | *.cjs)
    return 0
    ;;
  *)
    return 1
    ;;
  esac
}

# Emit lookup-table keys (package names) one per line, in declaration order.
# Reads from the global `lookup` path. Exits 1 if the file cannot be opened.
collect_lookup_keys() {
  awk '
    /^## / {
      # Strip the leading "## " and emit the key.
      print substr($0, 4)
    }
  ' "$lookup"
}

# Emit the body of the section whose heading matches `$1`. The body is every
# line after `## <key>` up to (but not including) the next `## ` line or EOF.
# Leading and trailing blank lines are stripped so output composes cleanly
# with the `## <key>` heading the caller emits.
extract_section_body() {
  local key="$1"
  awk -v target="$key" '
    /^## / {
      current = substr($0, 4)
      in_section = (current == target) ? 1 : 0
      next
    }
    in_section { print }
  ' "$lookup" | awk '
    # Buffer lines so we can strip leading and trailing blanks.
    { lines[NR] = $0 }
    END {
      start = 1
      end = NR
      while (start <= end && lines[start] == "") start++
      while (end >= start && lines[end] == "") end--
      for (i = start; i <= end; i++) print lines[i]
    }
  '
}

# Test whether any scannable file in `--changed-files` imports or requires
# the package identified by `$1`. Returns 0 on match, 1 otherwise.
#
# Matches both bare-package and subpath imports: `from 'pkg'`, `from
# 'pkg/sub'`, `require('pkg')`, `require('pkg/sub')` (single or double
# quoted). Uses fixed-string matching (`grep -F`) so package names
# containing regex metacharacters like `@` and `/` need no escaping.
file_matches_key() {
  local key="$1"
  local file
  local patterns=(
    "from '${key}'"
    "from \"${key}\""
    "from '${key}/"
    "from \"${key}/"
    "require('${key}')"
    "require(\"${key}\")"
    "require('${key}/"
    "require(\"${key}/"
  )

  while IFS= read -r file || [[ -n "$file" ]]; do
    [[ -z "$file" ]] && continue
    if ! is_scannable_extension "$file"; then
      continue
    fi
    if [[ ! -f "$file" ]]; then
      # Deleted or otherwise absent — silently skip.
      continue
    fi
    if grep -qF \
      -e "${patterns[0]}" \
      -e "${patterns[1]}" \
      -e "${patterns[2]}" \
      -e "${patterns[3]}" \
      -e "${patterns[4]}" \
      -e "${patterns[5]}" \
      -e "${patterns[6]}" \
      -e "${patterns[7]}" \
      "$file" 2>/dev/null; then
      return 0
    fi
  done <"$changed_files"

  return 1
}

# Emit the assembled reviewer-context block. Sidecar content first (when
# non-empty), then matched lookup sections in lookup-table declaration
# order. Adjacent blocks are separated by exactly one blank line. Each
# emitted block (sidecar or lookup section) ends with a single trailing
# newline; no trailing blank lines on the overall output.
emit_block() {
  # Pre-compute matched keys so we know whether anything follows the sidecar.
  local matched_keys=()
  local key
  while IFS= read -r key || [[ -n "$key" ]]; do
    [[ -z "$key" ]] && continue
    if file_matches_key "$key"; then
      matched_keys+=("$key")
    fi
  done < <(collect_lookup_keys)

  local need_separator=0

  if [[ -n "$sidecar" && -s "$sidecar" ]]; then
    # `cat` preserves the file's bytes; the file may or may not end with a
    # newline. Normalize via awk so the sidecar block always ends with
    # exactly one newline.
    awk '{ print }' "$sidecar"
    need_separator=1
  fi

  local body
  for key in "${matched_keys[@]}"; do
    if ((need_separator)); then
      printf '\n'
    fi
    printf '## %s\n\n' "$key"
    body="$(extract_section_body "$key")"
    if [[ -n "$body" ]]; then
      printf '%s\n' "$body"
    fi
    need_separator=1
  done
}

main() {
  parse_args "$@"

  if [[ -z "$changed_files" ]]; then
    echo "$PROG: missing required flag: --changed-files" >&2
    show_usage
  fi

  if [[ -z "$lookup" ]]; then
    echo "$PROG: missing required flag: --lookup" >&2
    show_usage
  fi

  if [[ ! -r "$changed_files" ]]; then
    echo "$PROG: cannot read --changed-files: $changed_files" >&2
    exit 1
  fi

  if [[ ! -r "$lookup" ]]; then
    echo "$PROG: cannot read --lookup: $lookup" >&2
    exit 1
  fi

  emit_block
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
