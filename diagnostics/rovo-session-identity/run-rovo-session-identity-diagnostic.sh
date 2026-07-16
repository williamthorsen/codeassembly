#!/usr/bin/env bash
set -euo pipefail

# run-rovo-session-identity-diagnostic.sh — Launch non-interactive Rovo session-identity diagnostic runs.
#
# Launches one headless Rovo run per workspace directory given (default: the current directory), pointing each at the
# sibling instructions file. Run labels are minted by the agent per the instructions, so no per-run setup is needed.
# Pass several directories, or the same directory more than once, to exercise concurrent sessions.
# Grade the resulting log with check-rovo-session-identity-log.sh.
#
# Never run these diagnostics in shadow mode: Shadow mode executes shell commands in a temporary environment, so the
# log appends would not land in the real log file.
#
# Usage:
#   run-rovo-session-identity-diagnostic.sh [options] [dir ...]
#   run-rovo-session-identity-diagnostic.sh --help

readonly PROG="$(basename "$0")"
readonly SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Command that starts a headless Rovo run; the instruction prompt is appended as its final argument.
# Edit here if the wrapper's headless form differs.
readonly ROVO_COMMAND=(rovo.sh run --yolo)

readonly DEFAULT_INSTRUCTIONS="$SCRIPT_DIR/rovo-diagnostic-instructions.md"
readonly DEFAULT_OUTPUT_DIR="$HOME/.codeassembly/diagnostics"
readonly LOG_BASENAME="rovo-session-diagnostic.log"

# Main flow
main() {
  local instructions="$DEFAULT_INSTRUCTIONS"
  local output_dir="$DEFAULT_OUTPUT_DIR"
  local dry_run=false
  local dirs=()

  # Parse options
  while [[ $# -gt 0 ]]; do
    case "$1" in
    --instructions=*) instructions="${1#*=}" ;;
    --instructions)
      instructions="${2:?$PROG: --instructions requires a value}"
      shift
      ;;
    --output-dir=*) output_dir="${1#*=}" ;;
    --output-dir)
      output_dir="${2:?$PROG: --output-dir requires a value}"
      shift
      ;;
    --dry-run) dry_run=true ;;
    -h | --help) show_usage 0 ;;
    -*)
      echo "$PROG: Unknown option $1" >&2
      show_usage
      ;;
    *) dirs+=("$1") ;;
    esac
    shift
  done

  # Default to a single run in the current directory
  if [[ ${#dirs[@]} -eq 0 ]]; then
    dirs=("$PWD")
  fi

  # Validate arguments
  if [[ ! -f "$instructions" ]]; then
    echo "$PROG: Instructions file not found: $instructions" >&2
    echo "Keep rovo-diagnostic-instructions.md beside this script, or pass --instructions" >&2
    exit 1
  fi
  local dir
  for dir in "${dirs[@]}"; do
    if [[ ! -d "$dir" ]]; then
      echo "$PROG: Not a directory: $dir" >&2
      exit 1
    fi
  done

  # Check dependencies
  if ! $dry_run && ! command -v "${ROVO_COMMAND[0]}" &>/dev/null; then
    echo "$PROG: Required command '${ROVO_COMMAND[0]}' not found" >&2
    echo "Adjust the ROVO_COMMAND constant at the top of this script to your Rovo launcher" >&2
    exit 127
  fi

  local log_file="$output_dir/$LOG_BASENAME"
  local runs_dir="$output_dir/runs"
  local prompt="Read $instructions and follow it in full-diagnostic mode. You are running non-interactively; skip the [interactive only] steps. Log to $log_file."

  if ! $dry_run; then
    mkdir -p "$runs_dir"
  fi

  # Launch one run per directory, concurrently
  local stamp
  stamp="$(date -u +%Y%m%d-%H%M%S)"
  local index=1
  local output_file
  local pids=() output_files=() run_dirs=()
  for dir in "${dirs[@]}"; do
    if $dry_run; then
      echo "--- dir=$dir"
      echo "${ROVO_COMMAND[*]} \"$prompt\""
    else
      output_file="$runs_dir/${stamp}-${index}.out.log"
      echo "$PROG: Launching diagnostic in $dir (output: $output_file)"
      (cd "$dir" && "${ROVO_COMMAND[@]}" "$prompt") >"$output_file" 2>&1 &
      pids+=("$!")
      output_files+=("$output_file")
      run_dirs+=("$dir")
    fi
    index=$((index + 1))
  done

  if $dry_run; then
    exit 0
  fi

  # Wait for all runs and report outcomes
  local failures=0
  for index in "${!pids[@]}"; do
    if wait "${pids[$index]}"; then
      echo "$PROG: Run in ${run_dirs[$index]} finished"
    else
      failures=$((failures + 1))
      echo "$PROG: Run in ${run_dirs[$index]} exited non-zero — inspect ${output_files[$index]}" >&2
    fi
  done

  echo "$PROG: Grade the log with: $SCRIPT_DIR/check-rovo-session-identity-log.sh --log $log_file"
  if [[ $failures -gt 0 ]]; then
    exit 1
  fi
}

# region | Helper functions

# Displays command-line syntax. Can exit with or without an error code.
show_usage() {
  cat >&2 <<USAGE
Launch non-interactive Rovo session-identity diagnostic runs.

Usage:
  $PROG [options] [dir ...]
  $PROG --help

Arguments:
  dir                   Workspace directory for a run; repeatable, and the same
                        directory may be given more than once for same-workspace
                        concurrency (default: current directory, one run)

Options:
  --instructions FILE   Agent instructions file (default: rovo-diagnostic-instructions.md
                        beside this script)
  --output-dir DIR      Directory for the diagnostic log and per-run output
                        captures (default: ~/.codeassembly/diagnostics)
  --dry-run             Print each launch command without running it
  -h, --help            Show this help

Dependencies:
  ${ROVO_COMMAND[0]}    Starts the headless Rovo run (see the ROVO_COMMAND
                        constant at the top of this script)

Examples:
  $PROG
  $PROG ~/repos/team/alpha ~/repos/team/beta ~/repos/team/beta
  $PROG --output-dir /tmp/rovo-diag --dry-run
USAGE
  exit "${1:-1}"
}
# endregion | Helper functions

main "$@"
