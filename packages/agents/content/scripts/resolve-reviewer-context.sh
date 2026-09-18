#!/usr/bin/env bash
# Assembles the reviewer-context block inlined under `## Reviewer context` in
# every reviewer prompt. Combines two independent sources:
#
#   1. A coder-emitted sidecar artifact (`*_coder_reviewer-context.md`),
#      written when the implementation phase investigated a third-party API
#      surface that surprised the coder.
#   2. A static lookup table (markdown with `## <package-name>` sections)
#      keyed on npm package identifiers that are known to confuse reviewers.
#
# Exit codes:
#   0  Normal: Content emitted (or empty stdout when nothing matched).
#   1  Usage error (missing/unknown flag) or unreadable required input.

set -euo pipefail
# Propagate failures from command substitutions ($(...)) under `set -e`.
shopt -s inherit_errexit

readonly PROG="$(basename "$0")"

sidecar=""
changed_files=""
lookup=""

# Parses CLI flags into the script-scope globals above. Resets every variable
# so that a repeated invocation starts from a clean slate.
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
      echo "$PROG: Unknown option: $1" >&2
      show_usage
      ;;
    esac
  done
}

# Shows command-line syntax. Exits with the supplied code (default 1) so that
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

# Tests whether a file path has a JS/TS extension worth scanning for imports.
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

# Emits lookup-table keys (package names) one per line, in declaration order.
collect_lookup_keys() {
  awk '
    /^## / {
      print substr($0, 4)
    }
  ' "$lookup"
}

# Emits the body of the section whose heading matches `$1`. The body is every
# line after `## <key>` up to (but not including) the next `## ` line or EOF.
extract_section_body() {
  local key="$1"
  awk -v target="$key" '
    /^## / {
      current = substr($0, 4)
      in_section = (current == target)
      next
    }
    in_section { print }
  ' "$lookup" | awk '
    # Buffer lines to strip leading and trailing blanks.
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

# Tests whether any scannable file in `--changed-files` imports or requires
# the package identified by `$1`. Returns 0 on match, 1 otherwise.
# Fixed-string matching (`grep -F`) spares package names containing regex
# metacharacters such as `@` and `/` from escaping.
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
      # The downstream `grep` suppresses stderr as well, covering the case in
      # which the file becomes unreadable between this check and that grep.
      continue
    fi
    if printf '%s\n' "${patterns[@]}" | grep -qFf - "$file" 2>/dev/null; then
      return 0
    fi
  done <"$changed_files"

  return 1
}

# Emits the assembled reviewer-context block: sidecar content first (when
# non-empty), then matched lookup sections in lookup-table declaration order.
# Exactly one blank line separates adjacent blocks, and the output carries no
# trailing blank line.
emit_block() {
  # Pre-compute matched keys to know whether anything follows the sidecar.
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
    # The sidecar may or may not end with a newline; awk normalizes it to
    # exactly one.
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
    echo "$PROG: Missing required flag: --changed-files" >&2
    show_usage
  fi

  if [[ -z "$lookup" ]]; then
    echo "$PROG: Missing required flag: --lookup" >&2
    show_usage
  fi

  if [[ ! -r "$changed_files" ]]; then
    echo "$PROG: Cannot read --changed-files: $changed_files" >&2
    exit 1
  fi

  if [[ ! -r "$lookup" ]]; then
    echo "$PROG: Cannot read --lookup: $lookup" >&2
    exit 1
  fi

  # A lookup file with no `## ` section headings yields no package keys, which
  # would make the whole lookup mechanism a silent no-op.
  # `grep -c` exits 1 on zero matches, so `|| true` keeps `set -e` from ending
  # the run before the count can be tested.
  local heading_count
  heading_count="$(grep -c '^## ' "$lookup" || true)"
  if [[ "$heading_count" -eq 0 ]]; then
    echo "$PROG: --lookup contains no package sections (expected '## <package-name>' headings): $lookup" >&2
    exit 1
  fi

  emit_block
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
