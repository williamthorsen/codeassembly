#!/usr/bin/env bash
# Resolve commit, ticket, and PR prefixes from preferences.
#
# Reads prefix conventions from `.agents/preferences.yaml` (project) with
# fallback to `~/.agents/preferences.yaml` (global), then to empty string.
#
# Usage:
#   describe-change.sh [--scope SCOPE] [--type TYPE]
#
# Output: JSON object with `commit_prefix`, `ticket_prefix`, and `pr_prefix`.
# Non-empty values include a trailing `: `.

set -euo pipefail

scope=""
type=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --scope)
      scope="$2"
      shift 2
      ;;
    --type)
      type="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

# Parse a specific prefix value from a YAML file.
# Reads line-by-line, tracks the current top-level section, and matches
# `prefix:` within the target section (commit, ticket, or pr).
parse_prefix() {
  local file="$1"
  local section="$2"
  local current_section=""
  local indent=""

  if [[ ! -f "$file" ]]; then
    return
  fi

  while IFS= read -r line || [[ -n "$line" ]]; do
    # Skip blank lines and comments
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue

    # Detect top-level keys (no leading whitespace, ends with colon)
    if [[ "$line" =~ ^[a-zA-Z_] ]]; then
      current_section="${line%%:*}"
      indent=""
      continue
    fi

    # Match prefix: within the target section
    if [[ "$current_section" == "$section" && "$line" =~ ^[[:space:]]+prefix:[[:space:]]*(.*) ]]; then
      local value="${BASH_REMATCH[1]}"
      # Strip inline comments
      value="${value%%#*}"
      # Trim trailing whitespace
      value="${value%"${value##*[![:space:]]}"}"
      # Strip surrounding quotes
      if [[ "$value" =~ ^\'(.*)\'$ ]]; then
        value="${BASH_REMATCH[1]}"
      elif [[ "$value" =~ ^\"(.*)\"$ ]]; then
        value="${BASH_REMATCH[1]}"
      fi
      echo "$value"
      return
    fi
  done < "$file"
}

# Resolve a prefix value by checking project, then global, then defaulting to empty.
resolve_prefix() {
  local section="$1"
  local value

  # Project preferences
  value="$(parse_prefix ".agents/preferences.yaml" "$section")"
  if [[ -n "$value" ]]; then
    echo "$value"
    return
  fi

  # Global preferences
  value="$(parse_prefix "$HOME/.agents/preferences.yaml" "$section")"
  if [[ -n "$value" ]]; then
    echo "$value"
    return
  fi

  echo ""
}

# Format a prefix string from a convention template, scope, and type.
# Convention placeholders: {scope}, {type}.
# When convention is empty, always emit empty.
# When only --type is provided, emit `{type}: ` regardless of convention.
# When only --scope or neither is provided, emit empty.
format_prefix() {
  local convention="$1"

  # Empty convention means no prefix
  if [[ -z "$convention" ]]; then
    echo ""
    return
  fi

  # Neither scope nor type
  if [[ -z "$scope" && -z "$type" ]]; then
    echo ""
    return
  fi

  # Only scope, no type
  if [[ -n "$scope" && -z "$type" ]]; then
    echo ""
    return
  fi

  # Only type, no scope
  if [[ -z "$scope" && -n "$type" ]]; then
    echo "${type}: "
    return
  fi

  # Both scope and type: substitute into convention
  local result="$convention"
  result="${result//\{scope\}/$scope}"
  result="${result//\{type\}/$type}"
  echo "${result}: "
}

commit_convention="$(resolve_prefix "commit")"
ticket_convention="$(resolve_prefix "ticket")"
pr_convention="$(resolve_prefix "pr")"

commit_prefix="$(format_prefix "$commit_convention")"
ticket_prefix="$(format_prefix "$ticket_convention")"
pr_prefix="$(format_prefix "$pr_convention")"

printf '{"commit_prefix":"%s","ticket_prefix":"%s","pr_prefix":"%s"}\n' \
  "$commit_prefix" "$ticket_prefix" "$pr_prefix"
