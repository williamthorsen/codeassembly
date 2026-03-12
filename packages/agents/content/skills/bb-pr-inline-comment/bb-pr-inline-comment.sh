#!/usr/bin/env bash
set -euo pipefail

# bb-pr-inline-comment.sh — Post an inline comment on a Bitbucket pull request.
#
# Authenticates via (in priority order):
#   1. Bot credentials: BITBUCKET_BOT_USERNAME + BITBUCKET_BOT_TOKEN (Basic auth)
#   2. BITBUCKET_API_TOKEN env var (Bearer auth)
#   3. macOS keychain entry "bitbucket-api-token" (Bearer auth, macOS only)
#
# Posts a comment anchored to a specific file and line number.
#
# Usage:
#   bb-pr-inline-comment.sh -f <file> -l <line> -m <comment>
#   echo "body" | bb-pr-inline-comment.sh -f <file> -l <line>
#   bb-pr-inline-comment.sh --help

readonly PROG="$(basename "$0")"

main() {
  # Show help (manual check — getopts cannot parse long options)
  if [[ "${1:-}" == "--help" ]]; then
    show_usage 0
  fi

  # Check dependencies
  for cmd in curl jq git; do
    if ! command -v "$cmd" &>/dev/null; then
      echo "$PROG: required command '$cmd' not found" >&2
      exit 127
    fi
  done

  local workspace="" repo_slug="" pr_id="" file_path="" line="" comment=""

  # Parse options
  while getopts ":w:r:p:f:l:m:h" opt; do
    case $opt in
    w) workspace="$OPTARG" ;;
    r) repo_slug="$OPTARG" ;;
    p) pr_id="$OPTARG" ;;
    f) file_path="$OPTARG" ;;
    l) line="$OPTARG" ;;
    m) comment="$OPTARG" ;;
    h) show_usage 0 ;;
    :)
      echo "$PROG: option -$OPTARG requires an argument" >&2
      exit 1
      ;;
    *)
      echo "$PROG: unknown option -$OPTARG" >&2
      show_usage
      ;;
    esac
  done

  # Read comment from stdin if not provided via -m
  if [[ -z "$comment" ]]; then
    if [[ -t 0 ]]; then
      echo "$PROG: no comment provided; use -m or pipe to stdin" >&2
      exit 1
    fi
    comment="$(cat)"
  fi

  # Auto-detect workspace and repo from git remote
  if [[ -z "$workspace" || -z "$repo_slug" ]]; then
    detect_workspace_repo
    workspace="${workspace:-$_detected_workspace}"
    repo_slug="${repo_slug:-$_detected_repo}"
  fi

  # Resolve auth
  local auth_style=""
  local auth_token=""
  resolve_auth

  # Auto-detect PR ID from current branch
  if [[ -z "$pr_id" ]]; then
    detect_pr_id "$workspace" "$repo_slug"
    pr_id="$_detected_pr_id"
  fi

  # Validate required arguments
  assert_nonempty "workspace (-w)" "$workspace"
  assert_nonempty "repo (-r)" "$repo_slug"
  assert_nonempty "pr_id (-p)" "$pr_id"
  assert_nonempty "file (-f)" "$file_path"
  assert_nonempty "line (-l)" "$line"
  assert_nonempty "comment (-m or stdin)" "$comment"

  # Validate line is a positive integer
  if [[ ! "$line" =~ ^[0-9]+$ ]]; then
    echo "$PROG: line number must be a positive integer, got '$line'" >&2
    exit 1
  fi

  # Build payload
  local payload
  payload="$(
    jq -n \
      --arg comment "$comment" \
      --arg path "$file_path" \
      --argjson line "$line" \
      '{
        content: { raw: $comment },
        inline: { path: $path, to: $line }
      }'
  )"

  # Post comment
  local url="https://api.bitbucket.org/2.0/repositories/${workspace}/${repo_slug}/pullrequests/${pr_id}/comments"

  local body
  body="$(bb_api POST "$url" "$payload")"
  echo "$body"
}

# Validate that a variable is non-empty
assert_nonempty() {
  local name="$1" value="$2"
  if [[ -z "$value" ]]; then
    echo "$PROG: $name is empty or unset" >&2
    exit 1
  fi
}

# Make an authenticated request to the Bitbucket API.
# Usage: bb_api <method> <url> [body]
# Prints the response body on success; exits on HTTP error.
bb_api() {
  local method="$1" url="$2" body="${3:-}"
  local response http_status

  local -a curl_args=(
    --silent --show-error --write-out "\n%{http_code}"
    --request "$method"
  )

  if [[ "$auth_style" == "basic" ]]; then
    curl_args+=(--user "${BITBUCKET_BOT_USERNAME}:${BITBUCKET_BOT_TOKEN}")
  else
    curl_args+=(--header "Authorization: Bearer ${auth_token}")
  fi

  if [[ -n "$body" ]]; then
    curl_args+=(--header "Content-Type: application/json" --data "$body")
  fi

  response=$(curl "${curl_args[@]}" "$url")
  http_status=$(echo "$response" | tail -n1)
  local response_body
  response_body=$(echo "$response" | sed '$d')

  if [[ "$http_status" -lt 200 || "$http_status" -ge 300 ]]; then
    echo "$PROG: API request failed with HTTP $http_status" >&2
    echo "$response_body" >&2
    exit 1
  fi

  echo "$response_body"
}

# Detect workspace and repo slug from git remote origin URL.
# Handles HTTPS (https://bitbucket.org/ws/repo[.git]) and
# SSH (git@bitbucket.org:ws/repo.git) patterns.
# Sets _detected_workspace and _detected_repo.
detect_workspace_repo() {
  local remote_url
  remote_url="$(git remote get-url origin 2>/dev/null || true)"

  if [[ -z "$remote_url" ]]; then
    echo "$PROG: cannot auto-detect workspace/repo — no git remote 'origin' found" >&2
    exit 1
  fi

  local ws="" repo=""

  # Strip trailing .git suffix before matching
  remote_url="${remote_url%.git}"

  if [[ "$remote_url" =~ bitbucket\.org[:/]([^/]+)/([^/]+)$ ]]; then
    ws="${BASH_REMATCH[1]}"
    repo="${BASH_REMATCH[2]}"
  else
    echo "$PROG: cannot parse workspace/repo from remote URL: $remote_url" >&2
    exit 1
  fi

  _detected_workspace="$ws"
  _detected_repo="$repo"
}

# Resolve authentication credentials.
# Sets auth_style ("basic" or "bearer") and auth_token in the caller's scope.
resolve_auth() {
  # Priority 1: bot credentials (Basic auth)
  if [[ -n "${BITBUCKET_BOT_USERNAME:-}" && -n "${BITBUCKET_BOT_TOKEN:-}" ]]; then
    auth_style="basic"
    return
  fi

  # Priority 2: BITBUCKET_API_TOKEN env var (Bearer auth)
  if [[ -n "${BITBUCKET_API_TOKEN:-}" ]]; then
    auth_style="bearer"
    auth_token="$BITBUCKET_API_TOKEN"
    return
  fi

  # Priority 3: macOS keychain (Bearer auth) — only on macOS
  if [[ "$(uname -s)" == "Darwin" ]]; then
    local keychain_token
    keychain_token="$(security find-generic-password -s "bitbucket-api-token" -w 2>/dev/null || true)"
    if [[ -n "$keychain_token" ]]; then
      auth_style="bearer"
      auth_token="$keychain_token"
      return
    fi
  fi

  echo "$PROG: no authentication configured" >&2
  echo "  Set BITBUCKET_BOT_USERNAME + BITBUCKET_BOT_TOKEN, or" >&2
  echo "  Set BITBUCKET_API_TOKEN, or" >&2
  echo "  Add macOS keychain entry 'bitbucket-api-token'" >&2
  exit 1
}

# Detect PR ID from the current git branch by querying the Bitbucket API.
# Sets _detected_pr_id.
detect_pr_id() {
  local ws="$1" repo="$2"
  local branch
  branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"

  if [[ -z "$branch" || "$branch" == "HEAD" ]]; then
    echo "$PROG: cannot auto-detect PR ID — not on a named branch" >&2
    exit 1
  fi

  local encoded_query
  encoded_query=$(printf 'source.branch.name="%s"' "$branch" | jq --slurp --raw-input --raw-output '@uri')

  local url="https://api.bitbucket.org/2.0/repositories/${ws}/${repo}/pullrequests?q=${encoded_query}&state=OPEN"

  local body
  body="$(bb_api GET "$url")"

  local count
  count=$(echo "$body" | jq '.size')

  if [[ "$count" -eq 0 ]]; then
    echo "$PROG: no open pull request found for branch '$branch'" >&2
    exit 1
  fi

  if [[ "$count" -gt 1 ]]; then
    echo "$PROG: multiple open pull requests found for branch '$branch':" >&2
    echo "$body" | jq -r '.values[] | "  PR #\(.id): \(.title)"' >&2
    exit 1
  fi

  _detected_pr_id=$(echo "$body" | jq '.values[0].id')
}

# Display usage information and exit
show_usage() {
  cat >&2 <<USAGE
Post an inline comment on a Bitbucket pull request.

Usage:
  $PROG -f <file> -l <line> -m <comment>
  $PROG -w <workspace> -r <repo> -p <pr_id> -f <file> -l <line> -m <comment>
  echo "body" | $PROG -f <file> -l <line>
  $PROG --help

Options:
  -w <workspace>   Bitbucket workspace (auto-detected from git remote)
  -r <repo>        Repository slug (auto-detected from git remote)
  -p <pr_id>       Pull request ID (auto-detected from current branch)
  -f <file>        File path in the repo (required)
  -l <line>        Line number (required)
  -m <comment>     Comment text (reads from stdin if omitted)
  -h, --help       Show this help

Auto-detection:
  Workspace and repo are parsed from \`git remote get-url origin\`.
  PR ID is resolved by querying the Bitbucket API for open PRs matching
  the current branch name.

Auth (in priority order):
  1. BITBUCKET_BOT_USERNAME + BITBUCKET_BOT_TOKEN  (Basic auth)
  2. BITBUCKET_API_TOKEN env var                    (Bearer auth)
  3. macOS keychain "bitbucket-api-token"           (Bearer auth, macOS only)

Keychain setup (macOS):
  security add-generic-password -a "\$USER" -s "bitbucket-api-token" -w "<token>"

  Generate a token at: https://bitbucket.org/account/settings/app-passwords/
  Required scopes: Repositories (Read), Pull requests (Read + Write)

Examples:
  $PROG -f src/foo.ts -l 42 -m "Refactor this loop."
  $PROG -w myteam -r my-repo -p 123 -f src/foo.ts -l 42 -m "Fix this."
  echo "Long comment" | $PROG -f src/bar.py -l 10
USAGE
  exit "${1:-1}"
}

main "$@"
