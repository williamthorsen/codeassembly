#!/usr/bin/env bash
set -euo pipefail

# extract-plugin-skills.sh — Extract skills from Claude Code plugins for Rovo Dev.
#
# Copies SKILL.md files (and companion files) from the plugin cache to agents/rovodev/skills/.
# Finds the latest installed version of the plugin automatically.
#
# Usage:
#   extract-plugin-skills.sh <plugin> [skill...]
#   extract-plugin-skills.sh --help

readonly PROG="$(basename "$0")"

source "$(git rev-parse --show-toplevel)/functions/colors.sh"

repo_root="$(git rev-parse --show-toplevel)"
plugin_cache="$HOME/.claude/plugins/cache/claude-plugins-official"
output_base="$repo_root/agents/rovodev/skills"

# -- Main flow --

main() {
  # Show help (manual check -- getopts cannot parse long options)
  if [[ "${1:-}" == "--help" ]]; then
    show_usage 0
  fi

  # Parse options
  while getopts ":h" opt; do
    case $opt in
    h) show_usage 0 ;;
    *)
      echo "$PROG: unknown option -$OPTARG" >&2
      show_usage
      ;;
    esac
  done
  shift $((OPTIND - 1))

  # Validate arguments
  if [[ $# -lt 1 ]]; then
    echo "$PROG: plugin name is required" >&2
    show_usage
  fi

  plugin="$1"
  shift
  requested_skills=("$@")

  # Find the latest version of the plugin
  plugin_dir="$plugin_cache/$plugin"
  if [[ ! -d "$plugin_dir" ]]; then
    echo "${red}x${normal} $PROG: plugin not found: $plugin" >&2
    echo "  Looked in: $plugin_dir" >&2
    exit 1
  fi

  latest_version=$(ls -1 "$plugin_dir" | sort -V | tail -1)
  if [[ -z "$latest_version" ]]; then
    echo "${red}x${normal} $PROG: no versions found for plugin: $plugin" >&2
    exit 1
  fi

  source_dir="$plugin_dir/$latest_version/skills"
  if [[ ! -d "$source_dir" ]]; then
    echo "${red}x${normal} $PROG: no skills directory in $plugin v$latest_version" >&2
    exit 1
  fi

  echo "Extracting from ${plugin} v${latest_version}"
  echo ""

  # Determine which skills to extract
  if [[ ${#requested_skills[@]} -eq 0 ]]; then
    mapfile -t skill_dirs < <(find "$source_dir" -mindepth 1 -maxdepth 1 -type d | sort)
  else
    skill_dirs=()
    for skill in "${requested_skills[@]}"; do
      if [[ -d "$source_dir/$skill" ]]; then
        skill_dirs+=("$source_dir/$skill")
      else
        echo "${yellow}!${normal} Skill not found: $skill (skipping)" >&2
      fi
    done
  fi

  if [[ ${#skill_dirs[@]} -eq 0 ]]; then
    echo "${red}x${normal} $PROG: no skills to extract" >&2
    exit 1
  fi

  extracted=0
  for skill_path in "${skill_dirs[@]}"; do
    skill_name=$(basename "$skill_path")
    target_dir="$output_base/$skill_name"

    mkdir -p "$target_dir"

    for file in "$skill_path"/*; do
      [[ -f "$file" ]] || continue
      filename=$(basename "$file")
      [[ "$filename" == "CREATION-LOG.md" ]] && continue
      cp "$file" "$target_dir/$filename"
    done

    echo "${green}ok${normal} $skill_name -> $target_dir"
    ((extracted++)) || true
  done

  echo ""
  echo "Extracted $extracted skill(s) from $plugin v$latest_version"
}

# region | Helper functions
show_usage() {
  cat >&2 <<USAGE
Extract skills from Claude Code plugins for Rovo Dev.

Usage:
  $PROG <plugin> [skill...]
  $PROG --help

Arguments:
  <plugin>     Plugin name, e.g., superpowers (required)
  [skill]      Specific skill name(s) to extract (default: all)

Options:
  -h, --help   Show this help

Examples:
  $PROG superpowers
  $PROG superpowers brainstorming
  $PROG superpowers brainstorming writing-plans
USAGE
  exit "${1:-1}"
}
# endregion | Helper functions

main "$@"
