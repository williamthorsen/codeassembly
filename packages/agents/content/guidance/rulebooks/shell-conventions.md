---
slug: shell-conventions
description: Conventions for writing production-quality bash scripts in this repository.
delivery: skill
version: 1
---

# Shell script conventions

Conventions for writing production-quality bash scripts in this repository. These complement the universal style rules (imperative-mood comments, verb-led function names, primary logic first, long-form CLI options).

## Script anatomy

Bash does not support forward function references — a function must be defined before it is called during execution. To keep primary logic visually prominent while ensuring all functions are defined before use, wrap the main flow in a `main()` function and call `main "$@"` at the bottom.

```bash
#!/usr/bin/env bash
set -euo pipefail

# script-name.sh — One-line purpose.
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
  # Show help (manual check — getopts cannot parse long options)
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

# Displays command-line syntax. Can exit with or without an error code.
show_usage() {
  cat >&2 <<USAGE
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
  exit "${1:-1}"
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
- **Main flow first**: Option parsing, validation, dependencies, core logic — inside `main()`.
- **Helpers at end**: Place helper functions after `main()`, before the `main "$@"` call.

## Help and exit codes

| Situation                                | Exit code              |
| ---------------------------------------- | ---------------------- |
| `--help` or `-h` (explicit help request) | 0                      |
| Bad input, missing arguments             | 1                      |
| Unknown command / subcommand             | 2                      |
| Required external command not found      | 127 (POSIX convention) |

`show_usage` accepts an optional exit code parameter, defaulting to 1:

```bash
show_usage() {
  cat >&2 <<USAGE
...
USAGE
  exit "${1:-1}"
}
```

Call sites: `show_usage 0` for help requests, `show_usage` (bare) for errors.

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

- **Always to stderr**: `echo "..." >&2`
- **Prefix with `$PROG:`**, so that piped output identifies the source.
- **Be actionable**: Tell the user what to do, not just what went wrong.

```bash
# Bad
echo "Error: Not found"

# Good
echo "$PROG: Stable worktree not found at $path" >&2
echo "Create it with: git worktree add $path main" >&2
```

## Dependency checks

Preflight-check external commands before using them:

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

Reusable utilities live in `functions/` and are sourced at runtime. Scripts resolve their own repo root so they always use co-versioned code, regardless of which worktree they run from:

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

Agent-specific modules live in `agents/functions/`:

| Module            | Provides                                                                  |
| ----------------- | ------------------------------------------------------------------------- |
| `project-slug.sh` | `resolve_project_slug`, `derive_slug_from_remote`, `persist_project_slug` |

**Extend rather than inline.** If you write a utility that could be reused across scripts, add it to an existing module or create a new one in `functions/`.

## Common mistakes

| Mistake                                | Fix                                                                                                          |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `set -e` alone                         | Use `set -euo pipefail` — `-u` catches typos in variable names, `pipefail` catches mid-pipeline failures     |
| `usage()` as function name             | Use `show_usage()` — functions start with verbs                                                              |
| `show_usage` always exits 1            | Accept exit code parameter: `exit "${1:-1}"`                                                                 |
| `which cmd` to check availability      | Use `command -v cmd` (POSIX-portable)                                                                        |
| Error messages to stdout               | Always `>&2`                                                                                                 |
| Interpolating user input into `jq`     | Use `jq --arg name "$value"` for safe binding                                                                |
| `${var//pat/repl}` with dynamic `repl` | Add `shopt -u patsub_replacement 2>/dev/null \|\| true`; bash 5.2+ expands `&` in `repl` to the matched text |
| Hard-coded values that vary            | Accept as arguments or use `readonly` defaults at the top                                                    |
| Duplicating logic across scripts       | Extract to `functions/` and source it                                                                        |
