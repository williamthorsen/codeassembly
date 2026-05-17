#!/usr/bin/env bash
# Emit canonical artifact-frontmatter fields as YAML (default) or JSON.
#
# Reads `.agents/{sanitized-branch}.branch-manifest.json` (produced by the
# `get-session-context` skill) for session-level fields and runs git +
# platform-specific PR lookup for the rest. Skills consume the output to
# populate the universal portion of their artifact frontmatter without
# repeating the underlying shell logic.
#
# Usage:
#   resolve-frontmatter.sh --skill NAME --interactive true|false [...]
#   resolve-frontmatter.sh --format json
#   resolve-frontmatter.sh --help
#
# Flags:
#   --skill NAME              provenance.skill value (required in yaml mode).
#   --interactive true|false  provenance.isInteractive value (required in yaml mode).
#   --model ID                provenance.model value (optional).
#   --extra KEY=VALUE         Append a scalar extension key (repeatable).
#                             Values may contain `=`; split on the first `=`.
#   --extra-list KEY=v1,v2,…  Append a flow-list extension key (repeatable).
#                             Values are split on `,`.
#   --override KEY=VALUE      Force a canonical/provenance field to VALUE.
#                             Empty VALUE force-omits the key.
#   --format yaml|json        Output format (default `yaml`).
#   --help, -h                Show usage and exit 0.
#
# Output (yaml mode, stdout): a complete YAML frontmatter block including
# `---` delimiters. Field order:
#
#   provenance:
#     skill, timestamp, baseSha, isInteractive, model     (camelCase)
#   ticket_id, ticket_ref, branch, commit, pr, run_id     (snake_case)
#   {--extra / --extra-list extensions in insertion order}
#
# Output (json mode, stdout): a single JSON object — backward-compatible
# with prior `--format json` (default) callers. Keys: branch, commit,
# baseSha, pr, ticket_id, ticket_ref, platform, timestamp, run_id.
#
# Omission rules (both formats): any key whose resolved value is empty is
# omitted entirely. `--override KEY=` with empty value force-omits even
# when the script resolved a value.
#
# Warnings (stderr): when PR resolution fails (not when it returns empty),
# emits the canonical warning `Note: PR lookup failed; proceeding without
# pr field.` so the caller can surface it in agent text output.
#
# Exit codes:
#   0  Success.
#   1  Missing branch manifest (run `get-session-context` first), not in a
#      git repo, missing `jq`, or required-arg violation in yaml mode.

set -euo pipefail

readonly PROG="$(basename "$0")"
readonly CANONICAL_WARNING='Note: PR lookup failed; proceeding without pr field.'
readonly PR_LOOKUP_TIMEOUT=5

show_usage() {
  local exit_code="${1:-1}"
  cat <<EOF
Usage:
  $PROG --skill NAME --interactive true|false [--model ID]
       [--extra KEY=VALUE ...] [--extra-list KEY=v1,v2,... ...]
       [--override KEY=VALUE ...] [--format yaml|json]
  $PROG --format json
  $PROG --help

Emit canonical artifact-frontmatter fields as YAML (default) or JSON.
See script header for field list, ordering, and omission semantics.
EOF
  exit "$exit_code"
}

# Main flow
main() {
  # -- Argument parsing --
  local format="yaml"
  local skill="" model=""
  local interactive=""
  local interactive_set=false
  declare -a extra_keys=()
  declare -A extra_values=()
  declare -A extra_kinds=()
  declare -A overrides=()

  while [[ "$#" -gt 0 ]]; do
    case "$1" in
    --help | -h)
      show_usage 0
      ;;
    --format)
      [[ "$#" -ge 2 ]] || fail "missing value for --format"
      format="$2"
      shift 2
      ;;
    --skill)
      [[ "$#" -ge 2 ]] || fail "missing value for --skill"
      skill="$2"
      shift 2
      ;;
    --interactive)
      [[ "$#" -ge 2 ]] || fail "missing value for --interactive"
      interactive="$2"
      interactive_set=true
      shift 2
      ;;
    --model)
      [[ "$#" -ge 2 ]] || fail "missing value for --model"
      model="$2"
      shift 2
      ;;
    --extra)
      [[ "$#" -ge 2 ]] || fail "missing value for --extra"
      add_extra "scalar" "$2" extra_keys extra_values extra_kinds
      shift 2
      ;;
    --extra-list)
      [[ "$#" -ge 2 ]] || fail "missing value for --extra-list"
      add_extra "list" "$2" extra_keys extra_values extra_kinds
      shift 2
      ;;
    --override)
      [[ "$#" -ge 2 ]] || fail "missing value for --override"
      add_override "$2" overrides
      shift 2
      ;;
    *)
      echo "$PROG: unexpected argument: $1" >&2
      show_usage 1
      ;;
    esac
  done

  case "$format" in
  yaml | json) ;;
  *) fail "unknown --format: $format (expected yaml|json)" ;;
  esac

  if [[ "$format" == "yaml" ]]; then
    [[ -n "$skill" ]] || fail "--skill is required in yaml mode"
    [[ "$interactive_set" == "true" ]] || fail "--interactive is required in yaml mode"
    case "$interactive" in
    true | false) ;;
    *) fail "--interactive must be true or false (got: $interactive)" ;;
    esac
  fi

  # -- Resolve session-level values --
  require_commands jq git

  local branch
  branch=$(current_branch) || fail "not in a git repository"

  local manifest
  manifest=$(read_manifest "$branch") || fail "branch manifest not found at .agents/$(sanitize_branch "$branch").branch-manifest.json — run get-session-context first"

  local commit
  commit=$(git rev-parse --short HEAD 2>/dev/null) || fail "could not resolve HEAD commit"

  local platform ticket_id ticket_ref default_branch
  platform=$(jq -r '.platform // "github"' <<<"$manifest")
  ticket_id=$(jq -r '.ticket_id // ""' <<<"$manifest")
  ticket_ref=$(jq -r '.ticket_ref // ""' <<<"$manifest")
  default_branch=$(jq -r '.default_branch // "origin/main"' <<<"$manifest")

  local base_sha pr_url run_id timestamp
  base_sha=$(resolve_base_sha "$default_branch")
  pr_url=$(resolve_pr_url "$platform" "$branch")
  run_id=$(resolve_run_id)
  timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)

  # -- Apply overrides --
  branch=$(apply_override "branch" "$branch" overrides)
  commit=$(apply_override "commit" "$commit" overrides)
  base_sha=$(apply_override "baseSha" "$base_sha" overrides)
  pr_url=$(apply_override "pr" "$pr_url" overrides)
  ticket_id=$(apply_override "ticket_id" "$ticket_id" overrides)
  ticket_ref=$(apply_override "ticket_ref" "$ticket_ref" overrides)
  platform=$(apply_override "platform" "$platform" overrides)
  timestamp=$(apply_override "timestamp" "$timestamp" overrides)
  run_id=$(apply_override "run_id" "$run_id" overrides)

  if [[ "$format" == "json" ]]; then
    emit_json "$branch" "$commit" "$base_sha" "$pr_url" \
      "$ticket_id" "$ticket_ref" "$platform" "$timestamp" "$run_id"
  else
    emit_yaml \
      "$skill" "$timestamp" "$base_sha" "$interactive" "$model" \
      "$ticket_id" "$ticket_ref" "$branch" "$commit" "$pr_url" "$run_id" \
      extra_keys extra_values extra_kinds
  fi
}

# Append an extension key/value to the caller's ordered list. Splits the
# argument once on the first `=`. `kind` is either `scalar` or `list`.
add_extra() {
  local kind="$1" arg="$2"
  local -n keys_ref="$3"
  local -n values_ref="$4"
  local -n kinds_ref="$5"
  local key value
  if [[ "$arg" != *"="* ]]; then
    fail "--extra/--extra-list argument missing '=': $arg"
  fi
  key="${arg%%=*}"
  value="${arg#*=}"
  [[ -n "$key" ]] || fail "--extra/--extra-list argument has empty key"
  if [[ -z "${kinds_ref[$key]:-}" ]]; then
    keys_ref+=("$key")
  fi
  values_ref["$key"]="$value"
  kinds_ref["$key"]="$kind"
}

# Record an override key=value. Empty value force-omits the key on emit.
add_override() {
  local arg="$1"
  local -n overrides_ref="$2"
  local key value
  if [[ "$arg" != *"="* ]]; then
    fail "--override argument missing '=': $arg"
  fi
  key="${arg%%=*}"
  value="${arg#*=}"
  [[ -n "$key" ]] || fail "--override argument has empty key"
  overrides_ref["$key"]="$value"
}

# Return the overridden value when the key has been overridden, otherwise
# the resolved value. The empty-string override force-omits.
apply_override() {
  local key="$1" resolved="$2"
  local -n overrides_ref="$3"
  if [[ -n "${overrides_ref[$key]+set}" ]]; then
    printf '%s' "${overrides_ref[$key]}"
  else
    printf '%s' "$resolved"
  fi
}

# Print short SHA of `default_branch` (e.g., `origin/main`) or empty if
# unresolvable. A shallow clone or missing remote silently degrades to empty.
resolve_base_sha() {
  local ref="$1"
  git rev-parse --short "$ref" 2>/dev/null || true
}

# Print the PR URL for the current branch, or empty if no PR or lookup
# failed. Distinguishes empty-output (silent) from failure (canonical
# warning emitted to stderr).
resolve_pr_url() {
  local platform="$1"
  local branch="$2"
  case "$platform" in
  github) resolve_github_pr "$branch" ;;
  bitbucket) resolve_bitbucket_pr "$branch" ;;
  *) warn_pr_failure "unknown platform: $platform" ;;
  esac
}

# GitHub PR lookup via `gh pr list`. Uses --state all so closed and merged
# PRs are resolvable for post-merge artifact writes.
resolve_github_pr() {
  local branch="$1"
  if ! command -v gh >/dev/null 2>&1; then
    warn_pr_failure "gh CLI not available"
    return
  fi
  local result rc
  result=$(run_with_timeout "$PR_LOOKUP_TIMEOUT" \
    gh pr list --head "$branch" --state all --json url --jq '.[0].url // empty' 2>/dev/null) || rc=$?
  if [[ "${rc:-0}" -ne 0 ]]; then
    warn_pr_failure "gh exited with code ${rc:-?}"
    return
  fi
  # Empty result is the normal no-PR case — silent.
  printf '%s' "$result"
}

# Bitbucket PR lookup via Bitbucket Cloud REST API.
resolve_bitbucket_pr() {
  local branch="$1"
  if ! command -v curl >/dev/null 2>&1; then
    warn_pr_failure "curl not available"
    return
  fi
  local workspace repo auth
  workspace="${BITBUCKET_WORKSPACE:-}"
  repo="${BITBUCKET_REPO:-}"
  if [[ -z "$workspace" || -z "$repo" ]]; then
    warn_pr_failure "BITBUCKET_WORKSPACE / BITBUCKET_REPO not set"
    return
  fi
  auth=$(bitbucket_auth_header) || {
    warn_pr_failure "no Bitbucket credentials configured"
    return
  }
  local url result rc
  url="https://api.bitbucket.org/2.0/repositories/$workspace/$repo/pullrequests?q=source.branch.name=\"$branch\"&state=OPEN,MERGED,DECLINED"
  result=$(run_with_timeout "$PR_LOOKUP_TIMEOUT" \
    curl --silent --fail --header "$auth" "$url" 2>/dev/null \
    | jq --raw-output '.values[0].links.html.href // empty' 2>/dev/null) || rc=$?
  if [[ "${rc:-0}" -ne 0 ]]; then
    warn_pr_failure "curl/jq exited with code ${rc:-?}"
    return
  fi
  printf '%s' "$result"
}

# Resolve a Bitbucket auth header from environment or macOS keychain. Echoes
# the full `Authorization:` header value or returns non-zero when no
# credentials are available.
bitbucket_auth_header() {
  if [[ -n "${BITBUCKET_BOT_USERNAME:-}" && -n "${BITBUCKET_BOT_TOKEN:-}" ]]; then
    local basic
    basic=$(printf '%s:%s' "$BITBUCKET_BOT_USERNAME" "$BITBUCKET_BOT_TOKEN" | base64)
    printf 'Authorization: Basic %s' "$basic"
    return 0
  fi
  if [[ -n "${BITBUCKET_API_TOKEN:-}" ]]; then
    printf 'Authorization: Bearer %s' "$BITBUCKET_API_TOKEN"
    return 0
  fi
  if command -v security >/dev/null 2>&1; then
    local token
    token=$(security find-generic-password -a "$USER" -s "bitbucket-api-token" -w 2>/dev/null) || return 1
    [[ -n "$token" ]] || return 1
    printf 'Authorization: Bearer %s' "$token"
    return 0
  fi
  return 1
}

# Emit the canonical PR-lookup-failed warning to stderr. The first argument
# is an internal diagnostic that is also written to stderr after the
# canonical line so debug context is available without affecting callers
# that match the canonical phrasing.
warn_pr_failure() {
  echo "$CANONICAL_WARNING" >&2
  echo "  ($1)" >&2
}

# Resolve the active run ID by reading the breadcrumb written by the
# orchestrate engine at `.claude/tmp/active-run-dir`. Empty when no
# orchestrated run is active.
resolve_run_id() {
  local breadcrumb=".claude/tmp/active-run-dir"
  [[ -r "$breadcrumb" ]] || return 0
  local run_dir
  run_dir=$(< "$breadcrumb")
  basename "$run_dir"
}

# Run a command with a timeout. Uses `timeout` or `gtimeout` when available,
# otherwise runs without a timeout (the agent's Bash-tool timeout still
# applies). The command and its arguments are passed verbatim.
run_with_timeout() {
  local secs="$1"
  shift
  if command -v timeout >/dev/null 2>&1; then
    timeout "${secs}s" "$@"
  elif command -v gtimeout >/dev/null 2>&1; then
    gtimeout "${secs}s" "$@"
  else
    "$@"
  fi
}

# Get the current branch name. Returns non-zero outside a git repository.
current_branch() {
  git rev-parse --abbrev-ref HEAD 2>/dev/null
}

# Read the branch manifest for the given branch. Echoes the JSON content.
# Returns non-zero when the manifest is missing.
read_manifest() {
  local branch="$1"
  local sanitized
  sanitized=$(sanitize_branch "$branch")
  local path=".agents/$sanitized.branch-manifest.json"
  [[ -r "$path" ]] || return 1
  cat "$path"
}

# Sanitize a branch name for filesystem use: replace `/` with `-` and trim
# any trailing `-` characters. Mirrors `get-session-context` behavior.
sanitize_branch() {
  local branch="$1"
  branch="${branch//\//-}"
  branch="${branch%%-}"
  printf '%s' "$branch"
}

# Construct the JSON output from resolved values. Optional fields are
# omitted (rather than emitted as null or empty) so consumers can rely on
# `has(field)` semantics.
emit_json() {
  local branch="$1" commit="$2" base_sha="$3" pr_url="$4"
  local ticket_id="$5" ticket_ref="$6" platform="$7" timestamp="$8" run_id="$9"

  jq -n \
    --arg branch "$branch" \
    --arg commit "$commit" \
    --arg base_sha "$base_sha" \
    --arg pr "$pr_url" \
    --arg ticket_id "$ticket_id" \
    --arg ticket_ref "$ticket_ref" \
    --arg platform "$platform" \
    --arg timestamp "$timestamp" \
    --arg run_id "$run_id" \
    '
    {
      branch: $branch,
      commit: $commit,
      platform: $platform,
      timestamp: $timestamp
    }
    + (if $base_sha   == "" then {} else { baseSha:    $base_sha   } end)
    + (if $pr         == "" then {} else { pr:         $pr         } end)
    + (if $ticket_id  == "" then {} else { ticket_id:  $ticket_id  } end)
    + (if $ticket_ref == "" then {} else { ticket_ref: $ticket_ref } end)
    + (if $run_id     == "" then {} else { run_id:     $run_id     } end)
    '
}

# Emit the canonical YAML frontmatter block, including `---` delimiters.
# Empty values are omitted. Field order is fixed: provenance block, then
# canonical top-level fields, then caller-supplied extensions in
# insertion order.
emit_yaml() {
  local skill="$1" timestamp="$2" base_sha="$3" interactive="$4" model="$5"
  local ticket_id="$6" ticket_ref="$7" branch="$8" commit="$9" pr_url="${10}" run_id="${11}"
  local -n yaml_extra_keys="${12}"
  local -n yaml_extra_values="${13}"
  local -n yaml_extra_kinds="${14}"

  printf '%s\n' "---"

  # provenance block
  printf '%s\n' "provenance:"
  emit_yaml_indented_scalar "skill" "$skill"
  emit_yaml_indented_scalar "timestamp" "$timestamp"
  [[ -n "$base_sha" ]] && emit_yaml_indented_scalar "baseSha" "$base_sha"
  # isInteractive is a boolean — emit unquoted true|false.
  printf '  %s: %s\n' "isInteractive" "$interactive"
  [[ -n "$model" ]] && emit_yaml_indented_scalar "model" "$model"

  # canonical top-level fields
  [[ -n "$ticket_id" ]] && emit_yaml_scalar "ticket_id" "$ticket_id"
  [[ -n "$ticket_ref" ]] && emit_yaml_scalar "ticket_ref" "$ticket_ref"
  emit_yaml_scalar "branch" "$branch"
  emit_yaml_scalar "commit" "$commit"
  [[ -n "$pr_url" ]] && emit_yaml_scalar "pr" "$pr_url"
  [[ -n "$run_id" ]] && emit_yaml_scalar "run_id" "$run_id"

  # extension fields in insertion order
  local key kind value
  for key in "${yaml_extra_keys[@]+"${yaml_extra_keys[@]}"}"; do
    value="${yaml_extra_values[$key]}"
    kind="${yaml_extra_kinds[$key]}"
    if [[ "$kind" == "list" ]]; then
      emit_yaml_flow_list "$key" "$value"
    else
      emit_yaml_scalar "$key" "$value"
    fi
  done

  printf '%s\n' "---"
}

# Emit a top-level YAML `key: value` line, auto-quoting the value as needed.
emit_yaml_scalar() {
  local key="$1" value="$2"
  printf '%s: %s\n' "$key" "$(yaml_quote "$value")"
}

# Emit an indented YAML `key: value` line inside the provenance block.
emit_yaml_indented_scalar() {
  local key="$1" value="$2"
  printf '  %s: %s\n' "$key" "$(yaml_quote "$value")"
}

# Emit a top-level YAML flow list: `key: [v1, v2, v3]`. Empty value emits
# an empty flow list `key: []`. Elements are split on `,` and each is
# passed through `yaml_quote`.
emit_yaml_flow_list() {
  local key="$1" raw="$2"
  if [[ -z "$raw" ]]; then
    printf '%s: []\n' "$key"
    return
  fi
  local IFS=','
  # shellcheck disable=SC2206
  local -a parts=( $raw )
  local out="" i
  for ((i = 0; i < ${#parts[@]}; i++)); do
    if [[ "$i" -gt 0 ]]; then
      out+=", "
    fi
    out+="$(yaml_quote "${parts[$i]}")"
  done
  printf '%s: [%s]\n' "$key" "$out"
}

# Return the value either bare or single-quoted depending on YAML
# auto-quoting rules. The predicate quotes when the value contains any of
# the unsafe glyphs (`# : [ ] { } , & * ! | > < ? % @ \` ` `), has leading
# or trailing whitespace, is empty, or begins with `-` / `?` / `:`.
# Embedded single quotes are doubled inside the quoted form.
yaml_quote() {
  local v="$1"
  if needs_yaml_quoting "$v"; then
    local escaped="${v//\'/\'\'}"
    printf "'%s'" "$escaped"
  else
    printf '%s' "$v"
  fi
}

# Decide whether `v` needs single-quote wrapping. Returns 0 (true) when
# quoting is required, 1 otherwise.
#
# YAML parses `:` as a key indicator only when followed by whitespace or
# end-of-value, so URLs like `https://...` are safe bare. `#` is always
# treated as a comment introducer in YAML 1.1/1.2 (the spec is permissive
# about the preceding context), so we quote any value containing `#`.
needs_yaml_quoting() {
  local v="$1"
  # Empty values must be quoted.
  [[ -z "$v" ]] && return 0
  # Leading or trailing whitespace.
  [[ "$v" =~ ^[[:space:]] ]] && return 0
  [[ "$v" =~ [[:space:]]$ ]] && return 0
  # Leading sigils that YAML interprets specially.
  case "$v" in
  -* | \?* | :*) return 0 ;;
  esac
  # Colon followed by whitespace anywhere is a key indicator.
  [[ "$v" =~ :[[:space:]] ]] && return 0
  # Trailing colon is the value-end form of a key indicator.
  [[ "$v" == *: ]] && return 0
  # Glyphs anywhere in the value that demand quoting.
  case "$v" in
  *'#'* | *'['* | *']'* | *'{'* | *'}'* \
    | *','* | *'&'* | *'*'* | *'!'* | *'|'* | *'>'* | *'<'* \
    | *'?'* | *'%'* | *'@'* | *'`'* | *"'"* | *'"'*)
    return 0
    ;;
  esac
  # Values that look like YAML booleans/null or numbers stay bare per the
  # current predicate. The predicate's value space is the schema's
  # canonical fields and known extensions; expand here if a future
  # extension introduces ambiguity.
  return 1
}

# Require each named command to be on PATH. Exits 1 with a clear message
# when one is missing.
require_commands() {
  local cmd
  for cmd in "$@"; do
    command -v "$cmd" >/dev/null 2>&1 || fail "required command not found: $cmd"
  done
}

# Print an error message to stderr and exit 1.
fail() {
  echo "$PROG: $1" >&2
  exit 1
}

# Guard against execution when sourced (e.g., from shellspec tests).
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
