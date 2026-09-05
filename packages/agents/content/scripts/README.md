# Helper scripts

Shared helpers installed into every platform target. The install pipeline copies (or symlinks) each `.sh` and `.mjs` file in this directory into `~/<platform_home>/scripts/` (e.g., `~/.claude/scripts/`, `~/.codex/scripts/`).

This directory holds two kinds of helper, distinguished by who invokes them:

- **Agent-invoked.** Helpers a skill or subagent runs, via the `{harness_home_dir}/scripts/` prefix documented below.
- **Harness-invoked.** Helpers wired into a harness's own configuration, with no agent in the loop.

The extension says how a helper is written, not who runs it: a `.sh` is a shell script kept in this directory, while a `.mjs` is a bundled TypeScript helper whose source is in `src/`. The bundles are build output, generated here by `scripts/bundle-skill-helpers.ts` and git-ignored. Either kind serves either invoker.

Files of any other extension (such as this README) are not installed.

## Invocation convention

Agent-facing content must invoke these scripts using the `{harness_home_dir}/scripts/` template prefix:

```
Run `{harness_home_dir}/scripts/resolve-frontmatter.sh --skill my-skill --interactive false` via Bash.
```

At install time, `{harness_home_dir}` expands to `~/.claude`, `~/.codex`, `~/.opencode`, or the equivalent per target platform, producing an explicit absolute path the agent can execute.

Bare invocations (e.g., `` Run `resolve-frontmatter.sh ...` ``) do not resolve at runtime: The install directory is not on `$PATH`, and only `feedback-memories.sh` is symlinked into `/usr/local/bin`. An agent that encounters a bare invocation typically guesses a path and fails before succeeding, wasting tool calls.

Prose mentions of script names that are not invocations (e.g., ``"the `describe-change.sh` script renders titles"``) do not need the prefix.

## Scripts

Agent-invoked:

- `describe-change.sh`: Renders titles for commits, tickets, PRs, and merges from declarative templates.
- `get-ticket-id.sh`: Extracts a ticket ID from a branch name.
- `resolve-frontmatter.sh`: Emits canonical artifact frontmatter (YAML or JSON) with provenance, ticket, branch, commit, and PR fields.
- `resolve-merge-options.sh`: Resolves merge-method and squash-title inputs from CLI overrides, label maps, and commit majority.
- `resolve-reviewer-context.sh`: Assembles the reviewer context block from a coder-emitted sidecar and a static lookup table.
- `select-lede-exemplars.mjs`: Selects author-approved ledes of a given work type from the lede-decision corpus, optionally floored at a quality rating. `--with-pair` reports each record's agent lede, merged lede, and author comment alongside the approved text.

Harness-invoked:

- `relay-hook-event.mjs`: Relays a harness event hook to a lifecycle event. Configured as a hook command, never run by an agent.

## Drift detection

The regression test at `content/__tests__/script-invocation-conventions.unit.test.ts` walks every `.md` file under `content/skills/` and `content/subagents/` and fails when any executable invocation of a known helper script lacks the `{harness_home_dir}/scripts/` prefix.

When adding a new helper script, append its filename to the `KNOWN_SCRIPTS` array in the test file.
