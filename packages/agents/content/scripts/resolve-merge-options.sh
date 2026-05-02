#!/usr/bin/env bash
# Resolve scope and type for a merge commit by combining CLI overrides,
# PR-label reverse-lookup, and commit-majority over the branch's commits.
#
# Usage:
#   resolve-merge-options.sh \
#     [--cli-scope SCOPE] [--cli-type TYPE] \
#     [--pr-label LABEL ...] \
#     --base-ref REF \
#     [--ticket-ref TOKEN] \
#     [--label-map PATH]
#   resolve-merge-options.sh --help
#
# Output: JSON object with one entry per dimension:
#
#   {"scope":{"status":"resolved","value":"agents"},
#    "type": {"status":"ambiguous","candidates":["feat","fix"]}}
#
# Resolution order per dimension:
#   1. CLI override (`--cli-scope`, `--cli-type`) wins outright.
#   2. Reverse-lookup against `--label-map` (default `.meta/label-map.json`):
#      exactly one distinct candidate among the PR labels resolves.
#   3. Commit-majority over `git log {base-ref}..HEAD --format=%s`:
#      a strict majority (>50%) of one value resolves.
#   4. Otherwise, return `ambiguous` with the union of label-derived and
#      commit-derived candidates (deduplicated, alphabetically sorted).
#
# The breaking-change marker `!` is stripped from type candidates after
# collection (it rides on a separate `breaking` label).
#
# Label-map handling:
#   - Missing file: silently skipped — resolution falls through to commit-majority.
#   - Missing `types`/`scopes` section: silently treated as empty, falls through.
#   - Syntactically invalid JSON: exits 1 with an error on stderr.
#
# Exit codes:
#   0  Normal — JSON produced (regardless of resolved/ambiguous status).
#   1  Usage error (missing/unknown flag) or runtime error (base-ref not found,
#      label-map malformed).

set -euo pipefail
# Propagate failures from command substitutions ($(...)) under `set -e`.
# Without this, a failing python helper inside `$(collect_label_candidates ...)`
# would be swallowed and the script would silently fall through to commit-majority.
shopt -s inherit_errexit

readonly PROG="$(basename "$0")"

cli_scope=""
cli_type=""
pr_labels=()
base_ref=""
ticket_ref=""
label_map=".meta/label-map.json"

# Parse CLI flags into the script-scope globals above. Resets every variable so
# repeated invocations under test start from a clean slate.
parse_args() {
  cli_scope=""
  cli_type=""
  pr_labels=()
  base_ref=""
  ticket_ref=""
  label_map=".meta/label-map.json"

  while [[ $# -gt 0 ]]; do
    case "$1" in
    --cli-scope)
      cli_scope="$2"
      shift 2
      ;;
    --cli-type)
      cli_type="$2"
      shift 2
      ;;
    --pr-label)
      pr_labels+=("$2")
      shift 2
      ;;
    --base-ref)
      base_ref="$2"
      shift 2
      ;;
    --ticket-ref)
      ticket_ref="$2"
      shift 2
      ;;
    --label-map)
      label_map="$2"
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

# Show command-line syntax. Exits with the supplied code (default 1) so callers
# can pass `0` for explicit `--help`, or call bare for usage errors.
show_usage() {
  cat >&2 <<USAGE
Resolve scope and type for a merge commit.

Usage:
  $PROG [--cli-scope SCOPE] [--cli-type TYPE] [--pr-label LABEL ...] \\
        --base-ref REF [--ticket-ref TOKEN] [--label-map PATH]
  $PROG --help

Options:
  --cli-scope SCOPE     Override the inferred scope.
  --cli-type TYPE       Override the inferred type (trailing '!' stripped).
  --pr-label LABEL      PR label (repeatable).
  --base-ref REF        Required. Git ref against which commit-majority is
                        evaluated (e.g. 'main' or 'origin/main').
  --ticket-ref TOKEN    Ticket reference (e.g. '#494'). Stripped from the
                        leading position of commit subjects before parsing.
  --label-map PATH      Path to label-map JSON. Defaults to
                        '.meta/label-map.json'.
  -h, --help            Show this help.

Output:
  JSON on stdout with one entry per dimension:
    {"scope":{"status":"resolved","value":"agents"},
     "type": {"status":"ambiguous","candidates":["feat","fix"]}}
USAGE
  exit "${1:-1}"
}

# JSON-escape a string for embedding in JSON output. Title-grade — covers
# backslash, double quote, and the C-style control characters (newline, CR,
# tab). For arbitrary content use a real JSON encoder.
json_escape() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\n'/\\n}"
  s="${s//$'\r'/\\r}"
  s="${s//$'\t'/\\t}"
  echo "$s"
}

# Strip a single trailing `!` from the input. The breaking-change marker rides
# on a separate `breaking` label and is not part of the type identity.
strip_bang() {
  local s="$1"
  if [[ "${s: -1}" == "!" ]]; then
    s="${s%!}"
  fi
  echo "$s"
}

# Reverse-lookup PR labels against `label_map[$1]` (e.g., "types" or "scopes")
# and emit distinct candidate values one per line. Empty output when the
# label-map file is absent, the section is missing, no labels are provided,
# or no labels match.
collect_label_candidates() {
  local section="$1"
  if [[ ! -f "$label_map" ]]; then
    return
  fi
  if [[ ${#pr_labels[@]} -eq 0 ]]; then
    return
  fi

  python3 - "$PROG" "$section" "$label_map" "${pr_labels[@]}" <<'PYTHON'
import json
import sys

prog = sys.argv[1]
section = sys.argv[2]
path = sys.argv[3]
labels = sys.argv[4:]

try:
    with open(path) as fh:
        data = json.load(fh)
except (OSError, json.JSONDecodeError) as exc:
    print(f"{prog}: cannot read label-map: {exc}", file=sys.stderr)
    sys.exit(1)

mapping = data.get(section, {})
inverted = {v: k for k, v in mapping.items()}

seen = []
for label in labels:
    if label in inverted:
        val = inverted[label]
        if val not in seen:
            seen.append(val)

for v in seen:
    print(v)
PYTHON
}

# Emit `count<TAB>value` lines (sorted by count descending, then value
# ascending) for the requested dimension by parsing commit subjects between
# `base_ref` and HEAD. Subjects without a `[scope|type: ]` prefix are skipped.
collect_commit_tally() {
  local dim="$1" # "scope" or "type"
  local subject scope_val type_val
  declare -A tally=()

  while IFS= read -r subject || [[ -n "$subject" ]]; do
    [[ -z "$subject" ]] && continue
    if [[ -n "$ticket_ref" && "$subject" == "$ticket_ref "* ]]; then
      subject="${subject#"$ticket_ref "}"
    fi
    if [[ "$subject" =~ ^([^|[:space:]]+)\|([^:[:space:]]+):[[:space:]] ]]; then
      scope_val="${BASH_REMATCH[1]}"
      type_val="${BASH_REMATCH[2]}"
      if [[ "$dim" == "scope" ]]; then
        tally["$scope_val"]=$((${tally["$scope_val"]:-0} + 1))
      else
        type_val="$(strip_bang "$type_val")"
        tally["$type_val"]=$((${tally["$type_val"]:-0} + 1))
      fi
    fi
  done < <(git log "$base_ref"..HEAD --format=%s 2>/dev/null || true)

  if [[ ${#tally[@]} -eq 0 ]]; then
    return
  fi

  local k
  for k in "${!tally[@]}"; do
    printf '%d\t%s\n' "${tally[$k]}" "$k"
  done | sort -k1,1nr -k2,2
}

# Read `count<TAB>value` lines from stdin. If the top entry's count exceeds
# half the total, print its value; otherwise print nothing.
strict_majority() {
  local lines
  lines="$(cat)"
  if [[ -z "$lines" ]]; then
    return
  fi

  local total=0 count
  while IFS=$'\t' read -r count _; do
    total=$((total + count))
  done <<<"$lines"

  local top_count top_value
  IFS=$'\t' read -r top_count top_value <<<"$(printf '%s\n' "$lines" | head -n1)"

  if ((top_count * 2 > total)); then
    echo "$top_value"
  fi
}

# Resolve a single dimension and emit its JSON fragment. The fragment carries
# either `{"status":"resolved","value":"X"}` or
# `{"status":"ambiguous","candidates":[...]}`.
resolve_dimension() {
  local dim="$1"
  local cli_value="$2"
  local section
  if [[ "$dim" == "scope" ]]; then
    section="scopes"
  else
    section="types"
  fi

  if [[ -n "$cli_value" ]]; then
    if [[ "$dim" == "type" ]]; then
      cli_value="$(strip_bang "$cli_value")"
    fi
    printf '"%s":{"status":"resolved","value":"%s"}' \
      "$dim" "$(json_escape "$cli_value")"
    return
  fi

  local label_candidates_raw label_count
  label_candidates_raw="$(collect_label_candidates "$section")"
  if [[ -z "$label_candidates_raw" ]]; then
    label_count=0
  else
    label_count=$(printf '%s\n' "$label_candidates_raw" | wc -l | tr -d ' ')
  fi

  if ((label_count == 1)); then
    printf '"%s":{"status":"resolved","value":"%s"}' \
      "$dim" "$(json_escape "$label_candidates_raw")"
    return
  fi

  local tally majority
  tally="$(collect_commit_tally "$dim")"
  majority="$(printf '%s\n' "$tally" | strict_majority)"

  if [[ -n "$majority" ]]; then
    printf '"%s":{"status":"resolved","value":"%s"}' \
      "$dim" "$(json_escape "$majority")"
    return
  fi

  local union_lines
  union_lines="$(
    {
      [[ -n "$label_candidates_raw" ]] && printf '%s\n' "$label_candidates_raw"
      [[ -n "$tally" ]] && printf '%s\n' "$tally" | awk -F'\t' '{print $2}'
    } | awk 'NF && !seen[$0]++' | sort
  )"

  local candidates_json="["
  local first=1 c
  while IFS= read -r c; do
    [[ -z "$c" ]] && continue
    if ((first)); then
      first=0
    else
      candidates_json+=","
    fi
    candidates_json+='"'"$(json_escape "$c")"'"'
  done <<<"$union_lines"
  candidates_json+="]"

  printf '"%s":{"status":"ambiguous","candidates":%s}' \
    "$dim" "$candidates_json"
}

main() {
  parse_args "$@"

  if [[ -z "$base_ref" ]]; then
    echo "$PROG: missing required flag: --base-ref" >&2
    show_usage
  fi

  if ! git rev-parse --verify "$base_ref" >/dev/null 2>&1; then
    echo "$PROG: base ref not found: $base_ref" >&2
    exit 1
  fi

  local scope_json type_json
  scope_json="$(resolve_dimension "scope" "$cli_scope")"
  type_json="$(resolve_dimension "type" "$cli_type")"
  printf '{%s,%s}\n' "$scope_json" "$type_json"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
