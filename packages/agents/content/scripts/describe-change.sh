#!/usr/bin/env bash
# Render commit, ticket, PR, and merge-commit titles from declarative templates.
#
# Reads `commit.title_format`, `ticket.title_format`, `pr.title_format`, and
# `merge_commit.title_format` from `.agents/preferences.yaml` (project) with
# fallback to `~/.agents/preferences.yaml` (global), then to empty string.
#
# Usage:
#   describe-change.sh [--scope SCOPE] [--type TYPE] [--title TITLE] \
#                      [--ticket-ref REF] [--pr-number N]
#
# Output: JSON object with `commit_title`, `ticket_title`, `pr_title`, and
# `merge_commit_title`.
#
# Templates support five tokens — `{scope}`, `{type}`, `{title}`,
# `{ticket_ref}`, `{pr_number}` — and optional groups via `[...]`. A `[...]`
# group renders verbatim if every token inside resolves non-empty; otherwise
# the entire group (literals included) drops. After substitution, runs of
# multiple spaces are collapsed and leading/trailing whitespace is trimmed.
# Nested `[...]` groups are not supported.

set -euo pipefail

scope=""
type=""
title=""
ticket_ref=""
pr_number=""

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
  --title)
    title="$2"
    shift 2
    ;;
  --ticket-ref)
    ticket_ref="$2"
    shift 2
    ;;
  --pr-number)
    pr_number="$2"
    shift 2
    ;;
  *)
    echo "Unknown option: $1" >&2
    exit 1
    ;;
  esac
done

# Parse a specific `title_format` value from a YAML file.
# Reads line-by-line, tracks the current top-level section, and matches
# `title_format:` within the target section (commit, ticket, pr, merge_commit).
# Outputs "FOUND:{value}" when the key is present (value may be empty),
# or nothing when the key is absent. This lets callers distinguish
# "key absent" from "key present with empty value."
parse_title_format() {
  local file="$1"
  local section="$2"
  local current_section=""

  if [[ ! -f "$file" ]]; then
    return
  fi

  while IFS= read -r line || [[ -n "$line" ]]; do
    # Skip blank lines and comments
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue

    # Detect top-level keys (no leading whitespace, ends with colon)
    if [[ "$line" =~ ^[a-zA-Z_] ]]; then
      current_section="${line%%:*}"
      continue
    fi

    # Match title_format: within the target section
    if [[ "$current_section" == "$section" && "$line" =~ ^[[:space:]]+title_format:[[:space:]]*(.*) ]]; then
      local value="${BASH_REMATCH[1]}"
      # Strip surrounding quotes and any trailing inline comment.
      # When the value is single- or double-quoted, capture the contents and
      # discard the rest of the line (so `#` characters inside the quoted
      # template are preserved). Otherwise, strip a `#` inline comment from
      # the unquoted value.
      if [[ "$value" =~ ^\'([^\']*)\'(.*)$ ]]; then
        value="${BASH_REMATCH[1]}"
      elif [[ "$value" =~ ^\"([^\"]*)\"(.*)$ ]]; then
        value="${BASH_REMATCH[1]}"
      else
        # Strip only the conventional ` # comment` form (space before `#`)
        # so unquoted templates may contain a literal `#` (e.g., `#{pr_number}`).
        value="${value%% #*}"
        # Trim trailing whitespace from the unquoted value
        value="${value%"${value##*[![:space:]]}"}"
      fi
      echo "FOUND:${value}"
      return
    fi
  done <"$file"
}

# Resolve a `title_format` value by checking project, then global, then defaulting to empty.
# parse_title_format returns "FOUND:{value}" when the key is present, or empty when absent.
# This lets an explicit empty value at the project level override a global non-empty value.
resolve_title_format() {
  local section="$1"
  local result

  # Project preferences
  result="$(parse_title_format ".agents/preferences.yaml" "$section")"
  if [[ "$result" == FOUND:* ]]; then
    echo "${result#FOUND:}"
    return
  fi

  # Global preferences
  result="$(parse_title_format "$HOME/.agents/preferences.yaml" "$section")"
  if [[ "$result" == FOUND:* ]]; then
    echo "${result#FOUND:}"
    return
  fi

  echo ""
}

# Render a title from a declarative template against the current token values.
# Tokens: {scope}, {type}, {title}, {ticket_ref}, {pr_number}.
# Empty template yields empty output. Each `[...]` group is dropped entirely
# when any token reference inside resolves to empty; otherwise it renders
# verbatim with tokens substituted. Final pass collapses runs of spaces and
# trims leading/trailing whitespace. Unknown tokens are left as-is so typos
# are visible. Nested `[...]` groups are not supported in v1.
render_title() {
  local template="$1"

  # Empty template means empty output
  if [[ -z "$template" ]]; then
    return
  fi

  # Process `[...]` groups left-to-right, non-overlapping
  local result=""
  local remaining="$template"
  while [[ "$remaining" =~ ^([^[]*)\[([^]]*)\](.*)$ ]]; do
    local before="${BASH_REMATCH[1]}"
    local group="${BASH_REMATCH[2]}"
    local after="${BASH_REMATCH[3]}"

    result+="$(substitute_tokens "$before")"
    result+="$(render_group "$group")"
    remaining="$after"
  done
  # Warn on a stray `[` left in the residue: an unmatched opening bracket
  # cannot start a group, so it falls through verbatim. Visible in output,
  # but easy to misread as intentional — surface it to stderr.
  if [[ "$remaining" == *'['* ]]; then
    echo "describe-change.sh: warning: unmatched '[' in template: $template" >&2
  fi
  # Substitute tokens in any trailing literal section
  result+="$(substitute_tokens "$remaining")"

  # Collapse runs of multiple spaces into a single space
  while [[ "$result" == *"  "* ]]; do
    result="${result//  / }"
  done
  # Trim leading and trailing whitespace
  result="${result#"${result%%[![:space:]]*}"}"
  result="${result%"${result##*[![:space:]]}"}"

  echo "$result"
}

# Substitute the five known tokens with their argument values.
# Unknown tokens (e.g., `{typo}`) are left as-is so the caller sees the typo.
substitute_tokens() {
  local s="$1"
  s="${s//\{scope\}/$scope}"
  s="${s//\{type\}/$type}"
  s="${s//\{title\}/$title}"
  s="${s//\{ticket_ref\}/$ticket_ref}"
  s="${s//\{pr_number\}/$pr_number}"
  echo "$s"
}

# Render the contents of a `[...]` group: drop the entire group if any token
# reference inside resolves empty; otherwise substitute and return the literal
# rendering. Only known tokens count toward the drop decision; unknown tokens
# never trigger a drop (they are left as-is by `substitute_tokens`).
render_group() {
  local group="$1"

  # If group references a token whose value is empty, drop the entire group
  if group_has_empty_token "$group"; then
    return
  fi

  substitute_tokens "$group"
}

# Return success (0) when the group references at least one known token whose
# resolved value is empty. Iterates the five known tokens and checks each.
group_has_empty_token() {
  local group="$1"

  if [[ "$group" == *"{scope}"* && -z "$scope" ]]; then
    return 0
  fi
  if [[ "$group" == *"{type}"* && -z "$type" ]]; then
    return 0
  fi
  if [[ "$group" == *"{title}"* && -z "$title" ]]; then
    return 0
  fi
  if [[ "$group" == *"{ticket_ref}"* && -z "$ticket_ref" ]]; then
    return 0
  fi
  if [[ "$group" == *"{pr_number}"* && -z "$pr_number" ]]; then
    return 0
  fi
  return 1
}

# Escape backslashes, double quotes, and JSON-illegal control characters
# (newline, carriage return, tab, backspace, form feed) for safe JSON
# interpolation. Backslash must be escaped first so subsequent backslash
# escapes (e.g., `\n`) are not double-escaped. This is a title-grade
# escaper — it does not handle the rest of U+0000–U+001F (e.g., ESC,
# BEL). For arbitrary content (commit bodies, etc.) use a real JSON
# encoder such as `python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))'`.
json_escape() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\n'/\\n}"
  s="${s//$'\r'/\\r}"
  s="${s//$'\t'/\\t}"
  s="${s//$'\b'/\\b}"
  s="${s//$'\f'/\\f}"
  echo "$s"
}

main() {
  local commit_template ticket_template pr_template merge_commit_template
  commit_template="$(resolve_title_format "commit")"
  ticket_template="$(resolve_title_format "ticket")"
  pr_template="$(resolve_title_format "pr")"
  merge_commit_template="$(resolve_title_format "merge_commit")"

  local commit_title ticket_title pr_title merge_commit_title
  commit_title="$(json_escape "$(render_title "$commit_template")")"
  ticket_title="$(json_escape "$(render_title "$ticket_template")")"
  pr_title="$(json_escape "$(render_title "$pr_template")")"
  merge_commit_title="$(json_escape "$(render_title "$merge_commit_template")")"

  printf '{"commit_title":"%s","ticket_title":"%s","pr_title":"%s","merge_commit_title":"%s"}\n' \
    "$commit_title" "$ticket_title" "$pr_title" "$merge_commit_title"
}

# Allow sourcing for testing without executing main.
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
