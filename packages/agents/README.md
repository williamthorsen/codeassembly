# @codeassembly/agents

Specialized subagents for orchestrated development workflows. This package provides skills, subagent definitions, and scripts that power the orchestration pipeline.

## Commands

Run via the `codeassembly-agents` CLI: `codeassembly-agents <command> [options]`.

| Command             | Description                                                                                                |
| ------------------- | ---------------------------------------------------------------------------------------------------------- |
| `install`           | Install shared guidance, scripts, and support data into harness directories                                |
| `init`              | Scaffold `.agents/codeassembly.yaml` for the project, or `--global` for `~/.agents/codeassembly.yaml`      |
| `sync`              | Resolve `.agents/codeassembly.yaml` and materialize declared rulebooks, skills, subagents, and collections |
| `uninstall`         | Remove installed guidance, skills, and subagents                                                           |
| `status`            | Show the current state of installed items                                                                  |
| `library list`      | List available library artifacts (rulebooks, skills, subagents, collections)                               |
| `generate <target>` | Generate a configuration file (e.g., `label-map`)                                                          |

Global options: `--harness <claude\|rovodev\|all>` (default `all`), `--link`, `--force`, `--dry-run`, and `--help`. Run `codeassembly-agents --help` for the authoritative list.

## Project declaration

A project opts into shared artifacts through `.agents/codeassembly.yaml`. Run `codeassembly-agents init` to scaffold one, declare the artifacts you want, then run `codeassembly-agents sync` to materialize them. The same declaration format resolves in two independent domains — the repo (via `sync`) and the user-global home (via `sync --global`). For the home domain, `codeassembly-agents init --global` scaffolds `~/.agents/codeassembly.yaml`, seeded with the `all` collection. See [Scopes](#scopes).

Authoring conventions for the artifacts you declare — frontmatter fields, the `dependencies:` and `members:` blocks, and naming — live in the `authoring-guidance` rulebook (`content/guidance/rulebooks/authoring-guidance.md`). This section documents the declaration mechanism itself.

### Format

The declaration is grouped by artifact type. Each type's block takes a `use` list (the slugs to adopt) and an optional `drop` list (slugs to remove from what broader scopes contributed):

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

A declared skill is deployed into each detected harness's project-local skills directory (`.claude/skills/<slug>/`) with the harness transform applied (include expansion, `{tool:…}` rewrite, link rewriting), carrying a `<!-- codeassembly-skill:<slug> -->` ownership marker so `sync` can retract it once it is no longer declared. Bare `sync` deploys into the project's harness directories; `sync --global` resolves the user-global tier and deploys the same way into the home harness directories instead (see [Scopes](#scopes)).

A skill may restrict itself to specific harnesses with a `harnesses:` frontmatter field (a single harness id or a list, e.g. `harnesses: [rovodev]`); `sync` then deploys it only into those harnesses, and `library list` shows the restriction. A skill with no `harnesses:` field deploys to every harness. This is how a skill that one harness provides natively — but the library supplies for the others — is targeted at just the harnesses that need it, without duplicating it per harness.

A declared subagent is deployed into each detected harness's project-local subagents directory (`.claude/agents/<slug>.md`), with the harness transform applied (frontmatter `_defaults` merge, `{tool:…}` rewrite, `{harness_home_dir}` rewrite) and a `<!-- codeassembly-subagent:<slug> -->` ownership marker so `sync` can retract it once it is no longer declared. A declared subagent deploys into the repo under `sync` and into the home harness directories under `sync --global`.

`rulebooks`, `skills`, `subagents`, and `collections` are all deployed.

### Collections

A collection is a traversal-only aggregate: it deploys no file of its own, but declaring it pulls in its members' transitive closure, which `sync` then deploys. Declare one like any other type:

```yaml
collections:
  use:
    - recommended
```

A collection lists its constituents under a `members:` key — either an explicit per-type block (the same shape `dependencies:` uses) or the computed token `'@library'`:

```yaml
members:
  skills:
    - capture-feedback
  subagents:
    - canary
```

`members:` is collections-only; rulebooks, skills, and subagents declare prerequisite edges under `dependencies:` instead. Declaring `dependencies:` on a collection, or `members:` on any other type, is an error that names the offending artifact.

Dropping or omitting a collection — or `root: true` — excludes its entire closure; dropping a single member that a collection contributed is not supported, so opt out of the whole collection or declare members à la carte instead. The shipped `all` collection is the whole catalog; `recommended` bundles a smaller default set. `codeassembly-agents init --global` seeds the user-global declaration (`~/.agents/codeassembly.yaml`) with `collections: use: [all]`, so `sync --global` deploys the whole catalog into the home directories; a project adds a collection for repo deployment by declaring it explicitly.

#### The `@library` token

A collection whose `members:` is the string `'@library'` resolves to every deployable artifact in the content library (all rulebooks, skills, and subagents), computed at resolution time so a newly added artifact joins automatically with no edit. The `@` sigil marks a computed directive rather than a literal slug, so the value must be YAML-quoted (`'@library'`). Collections are excluded from the result: the resolver never emits them, and "every collection" would be self-referential.

The shipped `all` collection carries `'@library'`; declaring `collections: use: [all]` deploys the whole catalog.

### Dependencies

A rulebook, skill, or subagent may declare dependencies on other artifacts in its frontmatter, grouped by artifact type. Resolution follows these edges transitively — deduped, with cycle detection — so declaring one artifact pulls in its whole closure:

```yaml
dependencies:
  rulebooks:
    - shell-conventions
  skills:
    - people-report
  subagents:
    - canary
```

The resolver follows `members:` and `dependencies:` identically; the split is semantic — a collection _contains_ members, while an artifact _depends on_ prerequisites.

### Scopes

The declaration resolves in two independent **domains**, each with its own base and local tiers and its own deployment target. The tiers within a domain run lowest to highest precedence.

**Repo domain** — `codeassembly-agents sync`, deploying into the repo:

1. **Project** — `.agents/codeassembly.yaml`, committed and shared with the team.
2. **Project-local** — `.agents/codeassembly.local.yaml`, gitignored, for personal overrides.

**Home domain** — `codeassembly-agents sync --global`, deploying into the home harness directories (`~/.claude`, `~/.rovodev`) and `~/.agents/`:

1. **User-global** — `~/.agents/codeassembly.yaml`, created by `init --global` (declares `all` by default).
2. **User-global-local** — `~/.agents/codeassembly.local.yaml`, for personal overrides that survive reinstalls.

A higher tier adds to and overrides the tiers below it _within the same domain_: `use` adds an entry, `drop` removes one a broader tier in that domain contributed, and `root: true` discards everything from broader tiers in that domain. The domains never cross — a project tier cannot `drop` a user-global entry, and bare `sync` never writes the home directories (it refuses to run when invoked from the home directory, directing you to `sync --global`). Ambient rulebooks inline into `.agents/PROJECT.md` in the repo domain and `~/.agents/GLOBAL.md` in the home domain. In both domains, the deployed Rovo Dev skills are indexed into `.rovodev/prompts.yml` so they surface in Rovo Dev's available-skills list; `sync` owns a single sentinel-delimited region in that file and leaves any hand-authored entries outside it untouched, in the home file as well as the project file.

When upgrading from a build where `install` deployed the catalog, run `install` once before `sync --global`: the new `install` prunes the skills and the whole-file `prompts.yml` it previously planted, and `sync --global` then re-deploys the skills as sync-owned and rewrites `prompts.yml` as a merged region. Running `sync --global` first stops at a refuse-to-overwrite error on those still-`install`-owned skill files, and would merge its region beneath the stale whole-file `prompts.yml` entries until the next `install` prunes them.

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
