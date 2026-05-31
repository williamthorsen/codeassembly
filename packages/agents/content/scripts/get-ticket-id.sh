#!/usr/bin/env bash
# Extract a Jira-style ticket ID from a branch name.
#
# Tries the Jira-style pattern first (case-insensitive `[A-Za-z]{2,}-[0-9]+`, uppercased on output).
# Falls back to a bare-numeric match anchored at the start of the branch name, formatted using
# `project.ticket_ref_prefix` from `.agents/preferences.yaml`.
#
# Usage:
#   get-ticket-id.sh [BRANCH_NAME]
#
# Arguments:
#   BRANCH_NAME   Branch to extract from. Defaults to the current git branch.
#
# Output: The resolved ticket ID on stdout, or an empty string when no ID can be derived. Exit status is always 0.

set -euo pipefail

readonly PROG="$(basename "$0")"

# Matches a Jira-style ticket ID anywhere in the branch name. Returns the first match (uppercased) or empty.
# Pattern: Two or more letters, hyphen, one or more digits, matched case-insensitively.
# Deliberately unanchored so author-prefixed branches (e.g., `wt/COMPPLAN-795`, `wthorsen/MAC-130`) match correctly.
# The greedy `[0-9]+` boundary stops at the first non-digit, so `.N` sub-ticket suffixes and `-description` suffixes
# are naturally truncated. See `_data/ticket-id-extraction.md` for the canonical contract.
extract_jira_id() {
  local branch_name="$1"
  echo "$branch_name" | grep -oiE '[A-Z]{2,}-[0-9]+' | head -1 | tr '[:lower:]' '[:upper:]' || true
}

# Match a bare-numeric prefix at the start of the branch name. Anchored
# deliberately so digits embedded in slugs (e.g., `feat/foo-2`) do not match.
extract_bare_number() {
  local branch_name="$1"
  echo "$branch_name" | grep -oE '^[0-9]+' | head -1 || true
}

# Resolve the project preferences file, anchored at the git repo root so that the lookup does not depend on the
# caller's working directory. Falls back to the current directory when not inside a git repository, preserving the
# prior relative-path behavior.
project_preferences_file() {
  local root
  root="$(git rev-parse --show-toplevel 2>/dev/null)" || root="$PWD"
  printf '%s/.agents/preferences.yaml' "$root"
}

# Reads `project.ticket_ref_prefix` from a preferences YAML file. Defaults to the preferences file at the repo root.
# Returns empty when the key is absent or the file does not exist.
# Handles both quoted and unquoted values, and strips trailing inline comments (`# ...`) from unquoted values. A `#`
# inside single or double quotes is preserved as part of the value.
read_ticket_ref_prefix() {
  local file="${1:-$(project_preferences_file)}"
  if [[ ! -f "$file" ]]; then
    return
  fi

  local line
  # Anchor the match at the start of the line (allowing leading whitespace) so that commented-out preference lines
  # (`# ticket_ref_prefix: ...`) are skipped.
  line=$(grep -E '^[[:space:]]*ticket_ref_prefix:' "$file" 2>/dev/null | head -1) || true
  if [[ -z "$line" ]]; then
    return
  fi

  # Strip everything up through `ticket_ref_prefix:` and any leading whitespace.
  line="${line#*ticket_ref_prefix:}"
  line="${line#"${line%%[![:space:]]*}"}"

  # No value (`ticket_ref_prefix:`) or a comment-only value
  # (`ticket_ref_prefix: # note`) both resolve to empty.
  if [[ -z "$line" || "$line" == "#"* ]]; then
    return
  fi

  # Quoted value: Capture the contents between the matching quotes. This preserves `#` characters inside the value.
  if [[ "$line" =~ ^\'([^\']*)\' ]]; then
    echo "${BASH_REMATCH[1]}"
    return
  fi
  if [[ "$line" =~ ^\"([^\"]*)\" ]]; then
    echo "${BASH_REMATCH[1]}"
    return
  fi

  # Unquoted value: Strip a trailing ` # comment` and surrounding whitespace.
  line="${line%% #*}"
  line="${line%"${line##*[![:space:]]}"}"
  echo "$line"
}

# Combine a bare number with the configured prefix to produce a ticket ID.
# - `#` prefix: Return the bare number alone (`#` is a GitHub display convention and must not appear in returned values
#   or file paths).
# - Other non-empty prefix: Return `{prefix}{number}` (e.g., `MAC-147`).
# - Empty prefix: Return the bare number unchanged.
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

# Resolve a ticket ID for the given branch name. Tries the Jira-style match first;
# falls back to the bare-numeric prefix when no Jira-style ID is found. Returns empty when neither matches.
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
