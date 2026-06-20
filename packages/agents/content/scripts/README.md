# Helper scripts

Shared shell helpers consumed by skills and subagents. The install pipeline copies (or symlinks) each `.sh` file in this directory into `~/<platform_home>/scripts/` for every platform target (e.g., `~/.claude/scripts/`, `~/.codex/scripts/`).

Non-`.sh` files in this directory (such as this README) are not installed.

## Invocation convention

Agent-facing content must invoke these scripts using the `{harness_home_dir}/scripts/` template prefix:

```
Run `{harness_home_dir}/scripts/resolve-frontmatter.sh --skill my-skill --interactive false` via Bash.
```

At install time, `{harness_home_dir}` expands to `~/.claude`, `~/.codex`, `~/.opencode`, or the equivalent per target platform, producing an explicit absolute path the agent can execute.

Bare invocations (e.g., `` Run `resolve-frontmatter.sh ...` ``) do not resolve at runtime: The install directory is not on `$PATH`, and only the launcher set (`claude.sh`, `rovo.sh`, etc.) is symlinked into `/usr/local/bin`. An agent that encounters a bare invocation typically guesses a path and fails before succeeding, wasting tool calls.

Prose mentions of script names that are not invocations (e.g., ``"the `describe-change.sh` script renders titles"``) do not need the prefix.

## Scripts

- `describe-change.sh`: Renders titles for commits, tickets, PRs, and merges from declarative templates.
- `get-ticket-id.sh`: Extracts a ticket ID from a branch name.
- `resolve-frontmatter.sh`: Emits canonical artifact frontmatter (YAML or JSON) with provenance, ticket, branch, commit, and PR fields.
- `resolve-merge-options.sh`: Resolves merge-method and squash-title inputs from CLI overrides, label maps, and commit majority.
- `resolve-reviewer-context.sh`: Assembles the reviewer context block from a coder-emitted sidecar and a static lookup table.

## Drift detection

The regression test at `packages/agents/src/__tests__/script-invocation-conventions.test.ts` walks every `.md` file under `content/skills/` and `content/subagents/` and fails when any executable invocation of a known helper script lacks the `{harness_home_dir}/scripts/` prefix.

When adding a new helper script, append its filename to the `KNOWN_SCRIPTS` array in the test file.
