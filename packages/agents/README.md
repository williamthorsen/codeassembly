<!-- readme-type: cli -->

# codeassembly

A CLI that installs reusable AI agent guidance into coding-harness directories, and the library of rulebooks, skills, and subagents that it deploys.

<!-- section:release-notes --><!-- /section:release-notes -->

## Installation

Try it without installing it:

```bash
npx codeassembly install
npx codeassembly sync
```

Add it to a project when the repo ships guidance of its own, or wants `sync` to run from a script:

```bash
pnpm add --save-dev codeassembly
```

`install` deploys the built-in library into the harness directories. `sync` resolves `.agents/codeassembly.yaml` and materializes exactly what the project declares, including guidance shipped by its dependencies (see [Packages](docs/project-declaration.md#packages)).

Supported harnesses are Claude Code and Rovo Dev; `--harness` narrows a run to one.

Optional: For a project whose tickets live in Jira, the deployed guidance resolves them through Atlassian's [`acli`](https://developer.atlassian.com/cloud/acli/) when it is on `PATH`, so `acli jira auth login --web` is worth running once. Without it, resolution falls back to a connected Jira read tool and then to asking for the ticket content.

## Commands

Run via the `codeassembly` CLI: `codeassembly <command> [options]`.

| Command             | Description                                                                                                |
| ------------------- | ---------------------------------------------------------------------------------------------------------- |
| `install`           | Install harness guidance, scripts, and support data into harness directories                               |
| `init`              | Scaffold `.agents/codeassembly.yaml` for the project, or `--global` for `~/.agents/codeassembly.yaml`      |
| `sync`              | Resolve `.agents/codeassembly.yaml` and materialize declared rulebooks, skills, subagents, and collections |
| `uninstall`         | Remove installed guidance, skills, and subagents                                                           |
| `sizes`             | Rank the last recorded deployment's documents by size, with the context aggregates beneath them            |
| `status`            | Show the current state of installed items                                                                  |
| `validate`          | Check a content root for defects that reach a consumer; writes nothing                                     |
| `bundle-helpers`    | Bundle the helpers that a content root declares; `--check` fails on a stale bundle                         |
| `library list`      | List available library artifacts (rulebooks, skills, subagents, collections)                               |
| `generate <target>` | Generate a configuration file (e.g., `label-map`)                                                          |

Global options: `--harness <claude\|rovo\|all>` (default `all`), `--link`, `--force`, `--dry-run`, `--output-style <auto\|plain\|rich>`, and `--help`. `--output-style` prints status glyphs as emoji (`rich`) or as words (`plain`); `auto`, the default, prints plain to a stream that is not a terminal or in CI, and `CODEASSEMBLY_OUTPUT_STYLE` sets it when the flag is absent. `--content <dir>` applies to `validate` and `bundle-helpers`, and `--check` to `bundle-helpers` alone, and `--override-writer` to `install` and `sync --global` (see [Designated home-domain writer](docs/project-declaration.md#designated-home-domain-writer)). Run `codeassembly --help` for the authoritative list.

## Session-lifecycle hooks

Skills report the work that they do, but they cannot report a session opening, exiting, or handing a turn back to the developer: At those moments, the session isn't running any skill. Each harness reports them instead, through its own event hooks, and `relay-hook-event.mjs` turns a hook into a lifecycle event:

| Event             | Claude Code        | Rovo Dev           |
| ----------------- | ------------------ | ------------------ |
| `session.started` | `SessionStart`     | `on_session_start` |
| `session.ended`   | `SessionEnd`       | `on_session_end`   |
| `turn.started`    | `UserPromptSubmit` | `on_user_prompt`   |
| `turn.completed`  | `Stop`             | `on_complete`      |

`install` places the relay in each harness's `scripts/` directory and then wires the entries below into the harness config (`~/.claude/settings.json`, `~/.rovo/config.yml`) by default. The wiring is its own step, shared across the CLI:

- `install --skip-hooks` installs everything else and leaves the configs untouched.
- `codeassembly configure-hooks` runs just the wiring, for re-applying it later.
- `configure-hooks --print` prints the entries without writing anything: the manual-adoption path for a config managed elsewhere. The snippets below are exactly what it emits.
- `uninstall` removes the entries; `status` reports each one as present, drifted, or absent.

Every managed command ends in `--sentinel codeassembly-agents`. That token is the ownership marker: The CLI creates, replaces, and removes only entries whose command contains it, so hand-written hooks and other tools' entries are never disturbed. The relay accepts the flag and ignores it.

The relay reports a boundary and nothing more. It never sends the prompt text, and it always exits 0: A relay that failed loudly would be worse than the missing event, since both harnesses read some non-zero hook exits as a signal to block the agent.

### Claude Code

In `~/.claude/settings.json`, under `hooks`. Each entry names the hook that it relays, so the relay never has to infer where it was called from:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node ~/.claude/scripts/relay-hook-event.mjs --harness claude --hook SessionStart --sentinel codeassembly-agents"
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node ~/.claude/scripts/relay-hook-event.mjs --harness claude --hook SessionEnd --sentinel codeassembly-agents"
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node ~/.claude/scripts/relay-hook-event.mjs --harness claude --hook UserPromptSubmit --sentinel codeassembly-agents"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node ~/.claude/scripts/relay-hook-event.mjs --harness claude --hook Stop --sentinel codeassembly-agents"
          }
        ]
      }
    ]
  }
}
```

Omit `matcher` on all four. `SessionStart` and `SessionEnd` accept one to select a start source or an end reason, and leaving it out relays every one of them; `UserPromptSubmit` and `Stop` ignore it.

Keep the whole invocation in `command` rather than splitting the flags into an `args` array: `~` expands only in the single-string form.

### Rovo Dev

In `~/.rovo/config.yml`, under `eventHooks`:

```yaml
eventHooks:
  events:
    - name: on_session_start
      commands:
        - command: node /Users/you/.rovo/scripts/relay-hook-event.mjs --harness rovo --hook on_session_start --sentinel codeassembly-agents
    - name: on_session_end
      commands:
        - command: node /Users/you/.rovo/scripts/relay-hook-event.mjs --harness rovo --hook on_session_end --sentinel codeassembly-agents
    - name: on_user_prompt
      commands:
        - command: node /Users/you/.rovo/scripts/relay-hook-event.mjs --harness rovo --hook on_user_prompt --sentinel codeassembly-agents
    - name: on_complete
      commands:
        - command: node /Users/you/.rovo/scripts/relay-hook-event.mjs --harness rovo --hook on_complete --sentinel codeassembly-agents
```

Write the home directory out in full where the snippet shows `/Users/you`: `configure-hooks` writes the machine's absolute path here, matching the entries that Rovo's own tooling generates.

Two things to know about Rovo:

- **Restart to pick up the change.** Rovo reads its config at startup, so a running session ignores hooks added under it.
- **`on_complete` fires when a run completes successfully.** A turn that errors or is aborted may not report its end, leaving that session reading as still working until its next event.

## Project declaration

A project opts into shared artifacts through `.agents/codeassembly.yaml`. Run `codeassembly init` to scaffold one, declare the artifacts that the project needs, then run `codeassembly sync` to materialize them. The same declaration format resolves in two independent domains: the repo (via `sync`) and the user-global home (via `sync --global`). For the home domain, `codeassembly init --global` scaffolds `~/.agents/codeassembly.yaml`, seeded with the `recommended` and `triage` collections. See [Scopes](docs/project-declaration.md#scopes).

Authoring conventions for the declared artifacts (frontmatter fields, the `dependencies:` and `members:` blocks, and naming) live in the `codeassembly-content-specification` rulebook (`content/guidance/rulebooks/codeassembly-content-specification.md`). [Project declaration](docs/project-declaration.md) documents the declaration mechanism itself:

- [Format](docs/project-declaration.md#format): the `use` and `drop` lists, harness targeting, and guidance hooks.
- [Collections](docs/project-declaration.md#collections): aggregates that pull in their members, and the `@library` token.
- [Dependencies](docs/project-declaration.md#dependencies): artifacts that a declared artifact pulls in.
- [Sources](docs/project-declaration.md#sources): content roots outside the built-in library.
- [Packages](docs/project-declaration.md#packages): guidance shipped by a dependency.
- [References](docs/project-declaration.md#references): documentation that a dependency ships for agents.
- [Content-format version](docs/project-declaration.md#content-format-version): the format contract that a content root declares.
- [Scopes](docs/project-declaration.md#scopes): the repo and home domains, the designated home-domain writer, and home-domain provenance.

A content root's own tests read it as consumers receive it through the `codeassembly/api` subpath; see [Content API](docs/content-api.md).

## Keeping deployed guidance current

`sync` writes what the declaration resolved at the moment it ran, and nothing re-runs it on its own. The rule is to sync when the content that it renders last changed, and that moment falls in a different place depending on where the content comes from:

| Role                                     | Content is ready when      | Trigger            | On failure   |
| ---------------------------------------- | -------------------------- | ------------------ | ------------ |
| Consumer of a guidance-shipping package  | the dependency is unpacked | root `postinstall` | warn, exit 0 |
| Provider whose content is a build output | its build finishes         | after the build    | fail         |

**Consumer.** A project whose declared artifacts come from [packages](docs/project-declaration.md#packages) can sync as soon as `pnpm install` finishes, so wire it there:

```json
{
  "scripts": {
    "postinstall": "codeassembly sync --warn-only"
  }
}
```

A failed `sync` reports every defect found by its pre-write gates, grouped by file the way `validate` reports a content root, and says that nothing was written and that the previously deployed guidance remains in effect. One run therefore names every rejected artifact rather than sending the author back for another run per file, and neither posture leaves a reader to guess whether part of the deployment was written.

`--warn-only` reports a failure and exits 0, and it belongs on this trigger specifically. `sync` fails closed on an unusable declared source, an unresolvable slug, a foreign-owned target, or a damaged ambient region; without the flag, any of those aborts `pnpm install` for everything downstream, which is far more disruptive than the stale guidance that it guards against. `pnpm install --ignore-scripts` skips the hook, so a tree installed that way keeps whatever the last sync left.

**Provider.** A repo that produces its own artifacts syncs after the build that produces them, and fails on error: The build has already succeeded by then. The tree is usable, and a non-zero exit is the signal rather than a broken checkout. Invoke the built bin rather than a source runner, so that a sync reached before the build stops at the `codeassembly` wrapper's build-output gate instead of deploying skill directories without the helper bundles that the build produces. That same gate is why this trigger cannot move to `postinstall`: Pre-build content is incomplete, and the wrapper exits before it parses `--warn-only` when the build output is absent.

A repo whose bootstrap always follows its install needs only the post-build trigger, which covers its package-borne artifacts too. Re-running `sync` on unchanged content rewrites nothing, so wiring both adds only the second run's startup. Either trigger is a no-op in a project that doesn't declare any artifacts.

Each live `sync` also records the deployment's sizes: It measures every file that it and `install` wrote and appends a size snapshot to a machine-local record under `~/.codeassembly/deployed-sizes/`, outside every repository. A live sync then reports what changed: each document that it added, removed, or resized, a warning for each that has just passed the growth ceiling, each document that has grown since the streamlining review that last read it, and the three totals. The `sizes` command reads that record and ranks the deployment's documents by size, with the always-loaded, on-invocation, and asset totals beneath them; `--global` reads the home deployment's record whatever the working directory. A sync never fails on a size condition, and `--dry-run` records nothing.

For the record's path and line shapes, the review marker that `streamline-guidance` appends, the conditions under which a snapshot is appended, and how the three aggregates are computed, see [Deployed sizes](docs/deployed-sizes.md).

## Preferences

Agent behavior is configured through `.agents/preferences.yaml` files. The resolution cascade is:

1. **Project**: `.agents/preferences.yaml` in the repository root (committed, shared with team)
2. **Global**: `~/.agents/preferences.yaml` in the user's home directory (personal defaults)
3. **Default**: built-in fallback (documented per key in [Preferences](docs/preferences.md))

Project-level values take precedence over global. An explicitly empty value at the project level (e.g., `title_format: ''`) overrides a non-empty global value.

Every key, its type, and its default are documented in [Preferences](docs/preferences.md), which ends with a full example.

## Prose sweep helper

`src/revise-prose/` contains the sweep that the `revise-prose` skill runs. Its commands, its detectors, and the per-repository record are documented in [docs/revise-prose-helper.md](docs/revise-prose-helper.md).

## Backlog sweep helper

`src/groom-backlog/` contains the helper that the `groom-backlog` skill runs. Its commands, its ledger, its comment marker, and the skill's arguments are documented in [docs/groom-backlog-helper.md](docs/groom-backlog-helper.md).

## Guidance streamlining helper

`src/streamline-guidance/` contains the helper that the `streamline-guidance` skill runs. Its commands, their output, and the record of declined cuts are documented in [docs/streamline-guidance-helper.md](docs/streamline-guidance-helper.md).

## Development

### Bin wrapper pattern

A package's `bin` field points to a committed wrapper script under `bin/` that dynamically imports the build output at runtime. Do not point `bin` entries directly into `dist/`: pnpm creates bin symlinks during install, and nothing compiles until `pnpm run bootstrap` runs afterward, so the target won't exist in a fresh worktree and `pnpm install` will emit confusing "Failed to create bin" warnings.

Any new `bin` entry in this monorepo should follow the same pattern. See `packages/mcp/bin/codeassembly-mcp.js` for the template, and the `@williamthorsen/node-monorepo-tools` packages for the original rationale.
