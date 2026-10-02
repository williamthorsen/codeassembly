<!-- readme-type: content -->

# Helper scripts

Shared helpers installed into every platform target. The install pipeline copies (or symlinks) each `.sh` and `.mjs` file in this directory into `~/<platform_home>/scripts/` (e.g., `~/.claude/scripts/`, `~/.codex/scripts/`).

This directory contains two kinds of helper, distinguished by who invokes them:

- **Agent-invoked.** Helpers run by a skill or subagent, via the `{harness_home_dir}/scripts/` prefix documented below.
- **Harness-invoked.** Helpers wired into a harness's own configuration, without an agent in the loop.

The extension says how a helper is written, not who runs it: A `.sh` is a shell script kept in this directory, while a `.mjs` is a bundled TypeScript helper whose source is in `src/`. The bundles are tracked build output, generated here by `codeassembly bundle-helpers` from the `helpers:` list in `codeassembly-content.yaml`, so a source edit is committed together with its rebuilt bundle. Either kind serves either invoker.

Files of any other extension (such as this README) are not installed.

## Invocation convention

Agent-facing content must invoke these scripts using the `{harness_home_dir}/scripts/` template prefix:

```
Run `{harness_home_dir}/scripts/resolve-frontmatter.sh --skill my-skill --interactive false` via Bash.
```

At install time, `{harness_home_dir}` expands to `~/.claude`, `~/.codex`, `~/.opencode`, or the equivalent per target platform, producing an explicit absolute path that the agent can execute.

Bare invocations (e.g., `` Run `resolve-frontmatter.sh ...` ``) do not resolve at runtime: The install directory is not on `$PATH`, and only `feedback-memories.sh` is symlinked into `/usr/local/bin`. An agent that encounters a bare invocation typically guesses a path and fails before succeeding, wasting tool calls.

Prose mentions of script names that are not invocations (e.g., ``"the `describe-change.mjs` script renders titles"``) do not need the prefix. `validate` recognizes an invocation by what surrounds the name: a flag, line continuation, quoted argument, shell variable, or shell operator after it, or an interpreter word (`bash`, `node`, `sh`, `source`, `zsh`) directly before it. Write a bundle's invocation as `node <path> <subcommand>`, which the interpreter word marks.

## Scripts

- `describe-change.mjs`: Renders titles for commits, tickets, PRs, and merges from declarative templates, the `{breaking}` marker included, reads a rendered title back into its parts, consolidates a commit range's entries into a consolidated record, applies overrides to a record, renders the fenced `change-record` block that ends a pull-request body, and resolves what a pull request merges as from that block and the pull request's commits. Invoke it as `node {harness_home_dir}/scripts/describe-change.mjs <subcommand>`, where [title-templates.md](../skills/_data/title-templates.md#invoking-the-bundle) names the subcommand for each; the bundle does not have a shebang.
- `get-ticket-id.sh`: Extracts a ticket ID from a branch name.
- `resolve-frontmatter.sh`: Emits canonical artifact frontmatter (YAML or JSON) with provenance, ticket, branch, commit, and PR fields, plus scalar and list extension keys.
- `resolve-reviewer-context.sh`: Assembles the reviewer context block from a coder-emitted sidecar and a static lookup table.
- `select-lede-exemplars.mjs`: Selects author-approved ledes of a given work type from the lede-decision corpus, optionally floored at a quality rating. `--with-pair` reports each record's agent lede, merged lede, and author comment alongside the approved text.

## Drift detection

`codeassembly validate` walks every `.md` file under `skills/` and `subagents/` and reports each executable invocation of a known helper script that lacks the `{harness_home_dir}/scripts/` prefix. Every file directly in this directory other than Markdown is a known script, so a new script is covered once it is added here.
