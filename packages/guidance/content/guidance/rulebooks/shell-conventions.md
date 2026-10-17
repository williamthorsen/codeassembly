---
slug: shell-conventions
description: Conventions for writing production-quality bash scripts in this repository.
delivery: skill
version: '6'
---

# Shell script conventions

Conventions for writing production-quality bash scripts in this repository. These complement the universal style rules (verb-led function names, primary logic first, long-form CLI options). A script's interface, meaning its help, exit codes, error messages, and progress reports, follows {rulebook:cli-conventions}; this rulebook states how a bash script implements it.

## Script anatomy

Bash does not support forward function references: A function must be defined before it is called during execution. To keep primary logic visually prominent while ensuring all functions are defined before use, wrap the main flow in a `main()` function and call `main "$@"` at the bottom.

```bash
#!/usr/bin/env bash
set -euo pipefail

# script-name.sh: One-line purpose.
#
# Extended description: What the script does, behavioral notes,
# composability characteristics.
#
# Usage:
#   script-name.sh <required> [optional]
#   script-name.sh --help

readonly PROG="$(basename "$0")"

# Main flow
main() {
  # Show help (manual check: getopts cannot parse long options)
  if [[ "${1:-}" == "--help" ]]; then
    show_usage 0
  fi

  # Parse options
  while getopts ":h" opt; do
    case $opt in
    h) show_usage 0 ;;
    *)
      echo "$PROG: Unknown option -$OPTARG" >&2
      show_usage
      ;;
    esac
  done
  shift $((OPTIND - 1))

  # Validate arguments
  # ...

  # Check dependencies
  # ...

  # Core logic
  # ...
}

# region | Helper functions

# Displays command-line syntax: to stdout for a help request (exit 0), to stderr otherwise.
show_usage() {
  local code="${1:-2}" fd=2
  ((code == 0)) && fd=1
  cat >&"$fd" <<USAGE
One-line purpose.

Usage:
  $PROG <arg> [options]
  $PROG --help

Arguments:
  <arg>        Description (required)

Options:
  -h, --help   Show this help

Dependencies:
  tool         Why it is needed

Examples:
  $PROG my-value
  result=\$($PROG my-value) && echo "\$result"
USAGE
  exit "$code"
}
# endregion | Helper functions

main "$@"
```

### Key structural rules

- **Shebang**: `#!/usr/bin/env bash` (not `/bin/bash`).
- **Strict mode**: `set -euo pipefail` unless there is a documented reason to omit a flag (e.g., `((count++))` returns 1 when count is 0 under `set -e`).
- **Header docblock**: Purpose, behavior notes, usage synopsis. Written as comments at the top of the file, before any code.
- **`readonly PROG`**: Use `$PROG` in all user-facing messages for consistency.
- **`main()` wrapper**: Wrap the main flow in a `main()` function. Call `main "$@"` at the bottom of the file, after all function definitions.
- **Main flow first**: Option parsing, validation, dependencies, and core logic go inside `main()`.
- **Helpers at end**: Place helper functions after `main()`, before the `main "$@"` call.

### Strict mode does not catch an empty path

`set -e` stops a script at a command that fails, and a command handed an empty path mostly succeeds. `cd ""` returns 0 and leaves the working directory where it was, so a script whose directory variable came out empty runs on, and every later relative write goes to the invoking directory instead of the intended one. `rm -rf "$dir/"*` and `mkdir -p "$dir/sub"` read an empty value the same way.

Read a path that must be non-empty as `${dir:?message}`, which aborts, whereas the bare expansion continues. This holds wherever the value comes from, and it matters most for a directory produced by a command, since in that case the empty value comes from a failure that the script did not see.

## Help and exit codes

The exit codes and the destination of help output are stated in the CLI conventions linked above. `show_usage` takes the exit code as an optional parameter, defaulting to 2, and chooses the stream from it:

```bash
show_usage() {
  local code="${1:-2}" fd=2
  ((code == 0)) && fd=1
  cat >&"$fd" <<USAGE
...
USAGE
  exit "$code"
}
```

Call sites: `show_usage 0` for a help request, and `show_usage` (bare) for a usage error.

### `--help` must be handled manually

`getopts` only handles single-character options. It sees `--help` as `--` (end of options) followed by positional argument `help`. Always add a manual check before the `getopts` loop (inside `main()`):

```bash
if [[ "${1:-}" == "--help" ]]; then
  show_usage 0
fi
```

## Argument parsing

**Short-option scripts** (few flags): Use `getopts` with a preceding `--help` check.

**Long-option scripts** (multiple long flags): Use a `while-case-shift` loop. This handles both `--flag value` and `--flag=value` forms:

```bash
while [[ $# -gt 0 ]]; do
  case "$1" in
  --size=*) SPLIT_SIZE="${1#*=}" ;;
  --size) SPLIT_SIZE="$2"; shift ;;
  --dry-run) DRY_RUN=true ;;
  -h | --help) show_usage 0 ;;
  -*) echo "$PROG: Unknown option $1" >&2; show_usage ;;
  *) POSITIONAL="$1" ;;
  esac
  shift
done
```

**Subcommand scripts**: Parse the subcommand first, then flags:

```bash
if [[ $# -lt 1 ]]; then
  show_usage
fi
cmd="$1"; shift
# ... parse flags ...
case "$cmd" in
list) do_list ;;
prune) do_prune ;;
*) echo "$PROG: Unknown command '$cmd'" >&2; show_usage ;;
esac
```

## Error messages

Write each message to stderr with `>&2`, and prefix it with `$PROG:`, so that it meets the error rules in the CLI conventions:

```bash
# Bad
echo "Error: Not found"

# Good
echo "$PROG: Stable worktree not found at $path" >&2
echo "Create it with: git worktree add $path main" >&2
```

## Dependency checks

Preflight-check external commands before using them, exiting with the missing-command code:

```bash
for cmd in wt jq; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "$PROG: Required command '$cmd' not found" >&2
    exit 127
  fi
done
```

Use `command -v` (POSIX), not `which` (non-standard behavior across platforms).

## The `functions/` library

Reusable utilities belong in `functions/` and are sourced at runtime. Scripts resolve their own repo root so that they always use co-versioned code, regardless of which worktree they run from:

```bash
_self="$0"; [[ "$_self" != */* ]] && _self="$(command -v "$0")"
readonly repo_dir="$(cd "$(dirname "$_self")" && git rev-parse --show-toplevel)"

source "$repo_dir/functions/symlinks.sh"
source "$repo_dir/functions/output.sh"
```

`WT_CONFIG_REPO_DIR` is reserved for cases that specifically require the `.live` worktree (e.g., symlink targets that apps read at runtime). Do not use it for sourcing functions.

### Available modules

| Module          | Provides                                                                                              |
| --------------- | ----------------------------------------------------------------------------------------------------- |
| `args.sh`       | `require_command`, `require_arg`                                                                      |
| `colors.sh`     | Terminal color variables: `green`, `yellow`, `red`, `normal`                                          |
| `env-vars.sh`   | `assert_nonempty`, `set_env_vars`                                                                     |
| `errors.sh`     | `die`, `die_with_usage`                                                                               |
| `git-checks.sh` | `assert_git_repo`, `assert_branch_exists`, `assert_clean_worktree`                                    |
| `output.sh`     | `run_silent` (buffer output, print only on failure)                                                   |
| `strings.sh`    | `to_kebab_case`                                                                                       |
| `symlinks.sh`   | `create_symlink`, `verify_symlink`, `ensure_symlinks`, `ensure_parent_directory`, `assert_fso_exists` |
| `yaml.sh`       | `parse_yaml_value` (two-level YAML value extraction without yq)                                       |

Agent-specific modules belong in `agents/functions/`:

| Module            | Provides                                                                  |
| ----------------- | ------------------------------------------------------------------------- |
| `project-slug.sh` | `resolve_project_slug`, `derive_slug_from_remote`, `persist_project_slug` |

**Extend rather than inline.** If you write a utility that could be reused across scripts, add it to an existing module or create a new one in `functions/`.

## Shellspec hooks

The strict-mode rule above governs a standalone script. A shellspec hook is a function in a file that shellspec sources, and it cannot use `set -e`: The option is shell-global, so setting it inside a hook changes shellspec's own behavior for the rest of the run.

Guard the step whose failure would let a later one act on bad state. A hook without a guard continues to its next statement after a failed one, and shellspec reports the hook's status only once every statement has run. By the time the failure is reported, the writes have already happened.

That step is usually the one establishing the workspace. Once it succeeds, a later failure is contained inside the temporary directory, so the example below guards only the first step.

```bash
# Bad: The bare call fails under an agent sandbox, leaving `tmpdir` empty, and the writes go to the invoking directory
setup_workspace() {
  tmpdir=$(mktemp -d)
  cd "$tmpdir"
  mkdir -p src
}

# Good: The hook returns at the failed step, and shellspec aborts the example before any write
setup_workspace() {
  enter_tmpdir || return 1
  mkdir -p src
}
```

Return non-zero rather than calling `exit`: Shellspec reads a non-zero `return` as a failed hook. Because a failed `BeforeEach` aborts the example body and `AfterEach` does not run after one, a cleanup helper never sees a half-built workspace.

Build the workspace through the shared helpers in `spec/spec_helper.sh` rather than calling `mktemp` in the hook. `make_tmpdir` and `remove_tmpdir` create and remove a temporary directory; `enter_tmpdir` and `leave_tmpdir` additionally make it the working directory and restore the previous one.

## Common mistakes

| Mistake                                | Fix                                                                                                          |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `set -e` alone                         | Use `set -euo pipefail`: `-u` catches typos in variable names, `pipefail` catches mid-pipeline failures      |
| `usage()` as function name             | Use `show_usage()`: Functions start with verbs                                                               |
| `show_usage` always exits 1            | Accept an exit-code parameter, and write to stdout when it is 0                                              |
| `which cmd` to check availability      | Use `command -v cmd` (POSIX-portable)                                                                        |
| Interpolating user input into `jq`     | Use `jq --arg name "$value"` for safe binding                                                                |
| `${var//pat/repl}` with dynamic `repl` | Add `shopt -u patsub_replacement 2>/dev/null \|\| true`; bash 5.2+ expands `&` in `repl` to the matched text |
| Hard-coded values that vary            | Accept as arguments or use `readonly` defaults at the top                                                    |
| Duplicating logic across scripts       | Extract to `functions/` and source it                                                                        |
