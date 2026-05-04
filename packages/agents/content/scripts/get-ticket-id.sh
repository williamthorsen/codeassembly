#!/usr/bin/env bash
# Extract a Jira-style ticket ID from a branch name.
#
# Tries the Jira-style pattern first (`[A-Z]+-[0-9]+` with an optional
# `.{N}` sub-ticket suffix). Falls back to a bare-numeric match anchored
# at the start of the branch name, formatted using `project.ticket_ref_prefix`
# from `.agents/preferences.yaml`.
#
# Usage:
#   get-ticket-id.sh [BRANCH_NAME]
#
# Arguments:
#   BRANCH_NAME   Branch to extract from. Defaults to the current git branch.
#
# Output: The resolved ticket ID on stdout, or an empty string when no ID
# can be derived. Exit status is always 0.

set -euo pipefail

readonly PROG="$(basename "$0")"

# Match a Jira-style ticket ID anywhere in the branch name. Returns the first
# match or empty. Pattern: one or more uppercase letters, hyphen, one or more
# digits, with an optional `.{N}` sub-ticket suffix. Deliberately unanchored
# so author-prefixed branches (e.g., `wt/COMPPLAN-795`) match correctly.
extract_jira_id() {
  local branch_name="$1"
  echo "$branch_name" | grep -oE '[A-Z]+-[0-9]+(\.[0-9]+)?' | head -1 || true
}

# Match a bare-numeric prefix at the start of the branch name. Anchored
# deliberately so digits embedded in slugs (e.g., `feat/foo-2`) do not match.
extract_bare_number() {
  local branch_name="$1"
  echo "$branch_name" | grep -oE '^[0-9]+' | head -1 || true
}

# Read `project.ticket_ref_prefix` from a preferences YAML file. Defaults to
# `.agents/preferences.yaml`. Returns empty when the key is absent or the
# file does not exist. Handles both quoted and unquoted values, and strips
# trailing inline comments (`# ...`) from unquoted values. A `#` inside
# single or double quotes is preserved as part of the value.
read_ticket_ref_prefix() {
  local file="${1:-.agents/preferences.yaml}"
  if [[ ! -f "$file" ]]; then
    return
  fi

  local line
  line=$(grep 'ticket_ref_prefix:' "$file" 2>/dev/null | head -1) || true
  if [[ -z "$line" ]]; then
    return
  fi

  # Strip everything up through `ticket_ref_prefix:` and any leading whitespace.
  line="${line#*ticket_ref_prefix:}"
  line="${line#"${line%%[![:space:]]*}"}"

  # Quoted value: capture the contents between the matching quotes. This
  # preserves `#` characters that appear inside the value.
  if [[ "$line" =~ ^\'([^\']*)\' ]]; then
    echo "${BASH_REMATCH[1]}"
    return
  fi
  if [[ "$line" =~ ^\"([^\"]*)\" ]]; then
    echo "${BASH_REMATCH[1]}"
    return
  fi

  # Unquoted value: strip a trailing ` # comment` and surrounding whitespace.
  line="${line%% #*}"
  line="${line%"${line##*[![:space:]]}"}"
  echo "$line"
}

# Combine a bare number with the configured prefix to produce a ticket ID.
# - `#` prefix: return the bare number alone (the `#` is a GitHub display
#   convention and must not appear in returned values or file paths).
# - Other non-empty prefix: return `{prefix}{number}` (e.g., `MAC-147`).
# - Empty prefix: return the bare number unchanged.
format_bare_ticket_id() {
  local bare_number="$1"
  local prefix="$2"

  if [[ "$prefix" == "#" ]]; then
    echo "$bare_number"
  elif [[ -n "$prefix" ]]; then
    echo "${prefix}${bare_number}"
  else
    echo "$bare_number"
  fi
}

# Resolve a ticket ID for the given branch name. Tries the Jira-style match
# first; falls back to the bare-numeric prefix when no Jira-style ID is
# found. Returns empty when neither matches.
extract_ticket_id() {
  local branch_name="$1"
  local ticket_id

  ticket_id="$(extract_jira_id "$branch_name")"
  if [[ -n "$ticket_id" ]]; then
    echo "$ticket_id"
    return
  fi

  local bare_number
  bare_number="$(extract_bare_number "$branch_name")"
  if [[ -z "$bare_number" ]]; then
    return
  fi

  local prefix
  prefix="$(read_ticket_ref_prefix)"
  format_bare_ticket_id "$bare_number" "$prefix"
}

main() {
  local branch_name="${1:-}"
  if [[ -z "$branch_name" ]]; then
    branch_name="$(git branch --show-current)"
  fi
  extract_ticket_id "$branch_name"
}

# Allow sourcing for testing without executing main.
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
