#!/usr/bin/env bash
# Extracts a Jira-style ticket ID from a branch name.
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

# Matches a Jira-style ticket ID anywhere in the branch name, or returns empty.
# The pattern is unanchored so that author-prefixed branches (`wt/COMPPLAN-795`, `wthorsen/MAC-130`) match.
# See `_data/ticket-id-extraction.md` for the canonical contract.
extract_jira_id() {
  local branch_name="$1"
  echo "$branch_name" | grep -oiE '[A-Z]{2,}-[0-9]+' | head -1 | tr '[:lower:]' '[:upper:]' || true
}

# Matches a bare-numeric prefix at the start of the branch name. The anchor keeps digits embedded in slugs
# (`feat/foo-2`) from matching.
extract_bare_number() {
  local branch_name="$1"
  echo "$branch_name" | grep -oE '^[0-9]+' | head -1 || true
}

# Resolves the project preferences file, anchored at the git repo root so that the lookup does not depend on the
# caller's working directory.
project_preferences_file() {
  local root
  if ! root="$(git rev-parse --show-toplevel 2>/dev/null)"; then
    root="$PWD"
    printf '%s: git could not resolve the repository root (%s); anchoring .agents/ lookup at %s\n' \
      "$PROG" "$(git rev-parse --show-toplevel 2>&1 || true)" "$root" >&2
  fi
  printf '%s/.agents/preferences.yaml' "$root"
}

# Reads `project.ticket_ref_prefix` from a preferences YAML file.
# Returns empty when the key is absent or the file does not exist.
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

  line="${line#*ticket_ref_prefix:}"
  line="${line#"${line%%[![:space:]]*}"}"

  # No value (`ticket_ref_prefix:`) or a comment-only value
  # (`ticket_ref_prefix: # note`) both resolve to empty.
  if [[ -z "$line" || "$line" == "#"* ]]; then
    return
  fi

  # Quoted value: Matching the quotes preserves a `#` inside the value.
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

# Combines a bare number with the configured prefix to produce a ticket ID.
# A `#` prefix is dropped: It is a GitHub display convention and must not appear in returned values or file paths.
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

# Resolves a ticket ID for the given branch name, or returns empty when no pattern matches.
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

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
