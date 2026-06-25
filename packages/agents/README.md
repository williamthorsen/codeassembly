# @codeassembly/agents

Specialized subagents for orchestrated development workflows. This package provides skills, subagent definitions, and scripts that power the orchestration pipeline.

## Commands

Run via the `codeassembly-agents` CLI: `codeassembly-agents <command> [options]`.

| Command             | Description                                                                                               |
| ------------------- | --------------------------------------------------------------------------------------------------------- |
| `install`           | Install guidance, skills, and subagents into harness directories, removing files whose source was deleted |
| `init`              | Scaffold an empty `.agents/codeassembly.yaml` in the current project                                      |
| `sync`              | Resolve `.agents/codeassembly.yaml` and materialize declared rulebooks, skills, and subagents             |
| `uninstall`         | Remove installed guidance, skills, and subagents                                                          |
| `status`            | Show the current state of installed items                                                                 |
| `library list`      | List available library artifacts (rulebooks, skills, subagents)                                           |
| `generate <target>` | Generate a configuration file (e.g., `label-map`)                                                         |

Global options: `--harness <claude\|rovodev\|all>` (default `all`), `--link`, `--force`, `--dry-run`, and `--help`. Run `codeassembly-agents --help` for the authoritative list.

## Project declaration

A project opts into shared artifacts through `.agents/codeassembly.yaml`. Run `codeassembly-agents init` to scaffold one, declare the artifacts you want, then run `codeassembly-agents sync` to materialize them.

### Format

The declaration is grouped by artifact category. Each category takes a `use` list (the slugs to adopt) and an optional `drop` list (slugs to remove from what broader scopes contributed):

```yaml
rulebooks:
  use:
    - shell-conventions
skills:
  use:
    - people-report
subagents:
  use:
    - canary
```

A declared rulebook is materialized into `.agents/rulebooks/<slug>.md` and, depending on its delivery mode, inlined into `.agents/PROJECT.md` and/or delivered as a `consult-<slug>` skill in each detected harness.

A declared skill is deployed verbatim into each detected harness's project-local skills directory (`.claude/skills/<slug>/`), carrying a `<!-- codeassembly-skill:<slug> -->` ownership marker so `sync` can retract it once it is no longer declared. Only a skill whose `SKILL.md` frontmatter sets `deploy: declared` can be deployed this way; a skill without the field installs unconditionally into the user-global harness directories instead (see the [`deploy` field](#the-deploy-field) below). Skill deployment is project-scoped: declared skills land in the project's harness directories, not the user-global ones.

A declared subagent is deployed into each detected harness's project-local subagents directory (`.claude/agents/<slug>.md`), with the harness transform applied (frontmatter `_defaults` merge, `{tool:…}` rewrite, `{harness_home_dir}` rewrite) and a `<!-- codeassembly-subagent:<slug> -->` ownership marker so `sync` can retract it once it is no longer declared. As with skills, only a subagent whose frontmatter sets `deploy: declared` is deployed this way; a subagent without the field installs unconditionally. Subagent deployment is project-scoped: a declared subagent resolves only where it is declared. Global (home) delivery for subagents is tracked by #857; until then, real, globally-dispatched subagents stay on `install` and are not migrated.

`rulebooks`, `skills`, and `subagents` are deployed. The `collections` category is accepted for forward compatibility; declaring a non-empty block of it raises an error until its deployment lands in a later release.

### The `deploy` field

A skill or subagent becomes declarable by setting `deploy: declared` in its frontmatter:

```yaml
---
name: people-report
description: …
deploy: declared
---
```

The field defaults to `install` when absent — the fail-safe default that keeps every artifact on the unconditional install path until it is explicitly migrated. A `declared` artifact is delivered only through a project's `codeassembly.yaml` declaration, never by `install`.

### Scopes

The declaration resolves across two tiers, lowest to highest precedence:

1. **Project** — `.agents/codeassembly.yaml`, committed and shared with the team.
2. **Project-local** — `.agents/codeassembly.local.yaml`, gitignored, for personal overrides.

A higher tier adds to and overrides the tiers below it: `use` adds a rulebook, `drop` removes one inherited from a broader scope, and `root: true` discards everything declared in broader scopes, starting fresh from that file.

## Preferences

Agent behavior is configured through `.agents/preferences.yaml` files. The resolution cascade is:

1. **Project** — `.agents/preferences.yaml` in the repository root (committed, shared with team)
2. **Global** — `~/.agents/preferences.yaml` in the user's home directory (personal defaults)
3. **Default** — built-in fallback (documented per key below)

Project-level values take precedence over global. An explicitly empty value at the project level (e.g., `title_format: ''`) overrides a non-empty global value.

### Schema

#### `project`

| Key                         | Type   | Default                                      | Description                                                                                                                                                                                                                            |
| --------------------------- | ------ | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `project.slug`              | string | Bare directory name of the working directory | Project identifier used for namespacing artifacts under `{base_dir}/projects/{slug}/`.                                                                                                                                                 |
| `project.ticket_ref_prefix` | string | `''`                                         | Prefix that appears at the start of `ticket_ref`. Use `#` for GitHub issues (added at render time, omitted from file paths) or a Jira project key like `MAC-` (part of the canonical ticket ID, included in file paths and templates). |

#### `artifacts`

| Key                       | Type   | Default          | Description                                                                                                |
| ------------------------- | ------ | ---------------- | ---------------------------------------------------------------------------------------------------------- |
| `artifacts.base_dir`      | string | `~/ai-artifacts` | Root directory for all generated artifacts (chats, plans, devlogs, tickets, runs). Supports `~` expansion. |
| `artifacts.paths.chats`   | string | `chats`          | Subdirectory name for chat artifacts, relative to the project artifact directory.                          |
| `artifacts.paths.devlogs` | string | `devlogs`        | Subdirectory name for devlog artifacts.                                                                    |
| `artifacts.paths.plans`   | string | `plans`          | Subdirectory name for plan artifacts.                                                                      |

#### `repository`

| Key                                        | Type   | Default  | Description                                                                                     |
| ------------------------------------------ | ------ | -------- | ----------------------------------------------------------------------------------------------- |
| `repository.default_remote.name`           | string | `origin` | Name of the default git remote.                                                                 |
| `repository.default_remote.default_branch` | string | `main`   | Default branch of the remote. Combined with the remote name to produce refs like `origin/main`. |
| `repository.slug`                          | string | —        | **Deprecated.** Use `project.slug` instead. Kept as a fallback.                                 |

#### `commit`, `ticket`, `pr`, `merge` — title format conventions

These four sections share the same structure. Each holds a declarative template that `describe-change.sh` renders into the title for the corresponding surface (commit, GitHub issue, pull request, and squash-merge commit).

| Key                   | Type   | Default | Description                                 |
| --------------------- | ------ | ------- | ------------------------------------------- |
| `commit.title_format` | string | `''`    | Template for commit titles.                 |
| `ticket.title_format` | string | `''`    | Template for issue titles.                  |
| `pr.title_format`     | string | `''`    | Template for pull-request titles.           |
| `merge.title_format`  | string | `''`    | Template for the squash-merge commit title. |

A template is a string containing literal text and any combination of the supported tokens listed below, with optional `[...]` groups for parts that should drop when their tokens are empty. An empty template is the explicit way to opt out — the corresponding rendered title will be the empty string. The `describe-change.sh` script outputs JSON with `commit_title`, `ticket_title`, `pr_title`, and `merge_title`.

##### Supported tokens

| Token          | Resolves to                                                                           |
| -------------- | ------------------------------------------------------------------------------------- |
| `{scope}`      | Change scope (workspace, package, module).                                            |
| `{type}`       | Work type (`feat`, `fix`, `docs`, …).                                                 |
| `{title}`      | Bare title text. Required in every template that should produce a non-empty title.    |
| `{ticket_ref}` | Rendered ticket reference (`#466`, `MAC-147`, …); empty when no ticket is associated. |
| `{pr_number}`  | PR number; empty when not yet known. Only meaningful in `merge.title_format`.         |

A template that omits `{title}` will not have it inserted implicitly; unknown tokens (e.g., `{titel}`) are left as-is so typos surface in the output.

Quote `title_format` values in YAML (single or double quotes are both fine). Quoting protects template characters such as `#`, `:`, and `|` from YAML's own parsing rules. In an unquoted value a bare `#` (e.g., `#{pr_number}`) is preserved, but YAML's inline-comment convention — a space immediately followed by `#` — silently truncates the rest of the template. `title_format: {title} # legacy` becomes `{title}` with no warning. When in doubt, quote.

##### Optional groups

A `[...]` group renders verbatim if every token reference inside resolves non-empty. If any inner token is empty, the entire group — literals included — drops. After substitution, runs of multiple spaces are collapsed and leading/trailing whitespace is trimmed. Groups are processed left-to-right; nesting is not supported.

Example template: `[{ticket_ref} ][{scope}|{type}: ]{title}[ (#{pr_number})]`

| Inputs                       | Output                              |
| ---------------------------- | ----------------------------------- |
| All five tokens populated    | `#466 agents\|feat: Add foo (#470)` |
| No `{ticket_ref}`            | `agents\|feat: Add foo (#470)`      |
| No `{scope}` and no `{type}` | `#466 Add foo (#470)`               |
| No `{pr_number}`             | `#466 agents\|feat: Add foo`        |
| Only `{title}`               | `Add foo`                           |

##### Examples

Bare title (no prefix):

```yaml
commit:
  title_format: '{title}'
ticket:
  title_format: '{title}'
pr:
  title_format: '{title}'
```

Produces: `Add script installer`

Type-only prefix (conventional commits without scope):

```yaml
commit:
  title_format: '{type}: {title}'
ticket:
  title_format: '{type}: {title}'
pr:
  title_format: '{type}: {title}'
```

Produces: `feat: Add script installer`

Scope-pipe-type prefix with optional drop (monorepo convention):

```yaml
commit:
  title_format: '[{scope}|{type}: ]{title}'
```

Produces: `agents|feat: Add script installer` when scope and type are present, `Add script installer` when either is missing.

Conventional commits with scope in parentheses:

```yaml
commit:
  title_format: '[{type}({scope}): ]{title}'
```

Produces: `feat(agents): Add script installer`

Squash-merge convention (the typical shape this repo uses):

```yaml
commit:
  title_format: '[{scope}|{type}: ]{title}'
ticket:
  title_format: '{title}'
pr:
  title_format: '[{ticket_ref} ][{scope}|{type}: ]{title}'
merge:
  title_format: '[{ticket_ref} ][{scope}|{type}: ]{title}[ (#{pr_number})]'
```

Produces (for `--scope agents --type feat --title 'Add foo' --ticket-ref '#466' --pr-number 470`):

- `commit_title`: `agents|feat: Add foo`
- `ticket_title`: `Add foo`
- `pr_title`: `#466 agents|feat: Add foo`
- `merge_title`: `#466 agents|feat: Add foo (#470)`

##### Scope values

- In a monorepo, the scope is the workspace name or abbreviation.
- `root` — commit touches only files in the monorepo root.
- `*` — commit spans multiple workspaces, or root and one or more workspaces.
- A root change tightly associated with one workspace (e.g., lockfile updated by a dependency added to that workspace) uses the workspace scope, not `root`.

##### Breaking changes

Append `!` after the type: `agents|feat!: Remove deprecated API`

#### `integrations`

| Key                         | Type    | Default | Description                                                  |
| --------------------------- | ------- | ------- | ------------------------------------------------------------ |
| `integrations.jira.enabled` | boolean | `false` | Enable Jira integration for ticket creation and referencing. |

#### `orchestration`

| Key                                | Type                                 | Default  | Description                                                                                                             |
| ---------------------------------- | ------------------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------- |
| `orchestration.max_review_rounds`  | integer                              | `3`      | Maximum iterative review rounds before marking `needs_manual_review`. Overridden by `--max-review-rounds` CLI argument. |
| `orchestration.approval_threshold` | `low` \| `medium` \| `high`          | `low`    | Minimum finding severity required for code approval. Overridden by `--approval-threshold`.                              |
| `orchestration.budget_threshold`   | `low` \| `medium` \| `high`          | `low`    | Minimum finding severity for spending remaining review-round budget. Overridden by `--budget-threshold`.                |
| `orchestration.mcp_policy`         | `required` \| `optional` \| `prompt` | `prompt` | How to handle MCP unavailability. `required` aborts, `optional` continues with a warning, `prompt` asks the developer.  |

##### Model overrides

`orchestration.models.{role}` assigns a model to a specific agent role. All values are optional and fall back to engine defaults.

| Key                                                   | Engine default |
| ----------------------------------------------------- | -------------- |
| `orchestration.models.default`                        | `sonnet`       |
| `orchestration.models.coder`                          | `opus`         |
| `orchestration.models.architect`                      | `sonnet`       |
| `orchestration.models.planner`                        | `sonnet`       |
| `orchestration.models.reviewer`                       | `sonnet`       |
| `orchestration.models.aspect_code_reviewer`           | `sonnet`       |
| `orchestration.models.aspect_silent_failure_reviewer` | `sonnet`       |
| `orchestration.models.aspect_test_reviewer`           | `sonnet`       |
| `orchestration.models.code_simplification_reviewer`   | `sonnet`       |
| `orchestration.models.holistic_reviewer`              | `opus`         |
| `orchestration.models.savings_analyzer`               | `haiku`        |

Note: `coder`, `holistic_reviewer`, and `savings_analyzer` have their own engine defaults and do not inherit from `orchestration.models.default`.

#### `editors`

Optional list of editor configurations. Each entry maps file extensions to an editor command.

```yaml
editors:
  - name: WebStorm
    command: webstorm
    extensions: '*.md'
```

| Key                    | Type   | Description                                                            |
| ---------------------- | ------ | ---------------------------------------------------------------------- |
| `editors[].name`       | string | Display name of the editor.                                            |
| `editors[].command`    | string | Shell command to open files. The file path is appended as an argument. |
| `editors[].extensions` | string | Glob pattern for file types this editor handles.                       |

### Full example

```yaml
project:
  slug: my-project
  ticket_ref_prefix: '#'

artifacts:
  base_dir: ~/ai-artifacts
  paths:
    chats: chats
    devlogs: devlogs
    plans: plans

repository:
  default_remote:
    name: origin
    default_branch: main

commit:
  title_format: '[{scope}|{type}: ]{title}'
ticket:
  title_format: '{title}'
pr:
  title_format: '[{ticket_ref} ][{scope}|{type}: ]{title}'
merge:
  title_format: '[{ticket_ref} ][{scope}|{type}: ]{title}[ (#{pr_number})]'

integrations:
  jira:
    enabled: false

orchestration:
  max_review_rounds: 3
  approval_threshold: low
  budget_threshold: low
  mcp_policy: prompt
  models:
    coder: sonnet
    holistic_reviewer: opus

editors:
  - name: WebStorm
    command: webstorm
    extensions: '*.md'
```
