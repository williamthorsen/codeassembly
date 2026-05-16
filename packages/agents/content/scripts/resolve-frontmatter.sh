#!/usr/bin/env bash
# Emit the canonical artifact-frontmatter fields as a single JSON object.
#
# Reads `.agents/{sanitized-branch}.branch-manifest.json` (produced by the
# `get-session-context` skill) for session-level fields and runs git +
# platform-specific PR lookup for the rest. Skills consume the JSON output
# to populate the universal portion of their artifact frontmatter without
# repeating the underlying shell logic.
#
# Usage:
#   resolve-frontmatter.sh
#   resolve-frontmatter.sh --help
#
# Output (stdout): a JSON object with these keys, all optional except
# `branch`, `commit`, `platform`, and `timestamp`:
#
#   branch        Raw branch name from session context.
#   commit        Short SHA of HEAD.
#   baseSha       Short SHA of `origin/{default_branch}`. Omitted if the
#                 ref is unresolvable (shallow clone, no remote, etc.).
#   pr            Full PR URL for the current branch. Omitted when no PR
#                 exists (lookup returned empty) AND on lookup failure
#                 (timeout, non-zero exit, auth error, etc.).
#   ticket_id     From session context. Omitted when null.
#   ticket_ref    From session context. Omitted when null.
#   platform      `github` or `bitbucket`, from session context.
#   timestamp     Current UTC ISO 8601 timestamp.
#   run_id        Active orchestrated-run ID, read from
#                 `.claude/tmp/active-run-dir` (basename) when present.
#                 Omitted otherwise.
#
# Warnings (stderr): when PR resolution fails (not when it returns empty),
# emits the canonical warning `Note: PR lookup failed; proceeding without
# pr field.` so the caller can surface it in agent text output. Empty
# output is the normal no-PR case and emits no warning.
#
# Exit codes:
#   0  Always when a JSON object is emitted (even with reduced fields).
#   1  Missing branch manifest — caller must invoke `get-session-context`
#      first. Not in a git repo. Missing `jq`.

set -euo pipefail

readonly PROG="$(basename "$0")"
readonly CANONICAL_WARNING='Note: PR lookup failed; proceeding without pr field.'
readonly PR_LOOKUP_TIMEOUT=5

show_usage() {
  local exit_code="${1:-1}"
  cat <<EOF
Usage:
  $PROG
  $PROG --help

Emit canonical artifact-frontmatter fields as a JSON object on stdout.
See script header for full field list and failure semantics.
EOF
  exit "$exit_code"
}

# Main flow
main() {
  if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
    show_usage 0
  fi

  if [[ "$#" -gt 0 ]]; then
    echo "$PROG: unexpected argument: $1" >&2
    show_usage 1
  fi

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

  emit_json "$branch" "$commit" "$base_sha" "$pr_url" \
    "$ticket_id" "$ticket_ref" "$platform" "$timestamp" "$run_id"
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
