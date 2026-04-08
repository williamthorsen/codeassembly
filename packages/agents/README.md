# @codeassembly/agents

Specialized subagents for orchestrated development workflows. This package provides skills, subagent definitions, and scripts that power the orchestration pipeline.

## Preferences

Agent behavior is configured through `.agents/preferences.yaml` files. The resolution cascade is:

1. **Project** — `.agents/preferences.yaml` in the repository root (committed, shared with team)
2. **Global** — `~/.agents/preferences.yaml` in the user's home directory (personal defaults)
3. **Default** — built-in fallback (documented per key below)

Project-level values take precedence over global. An explicitly empty value at the project level (e.g., `prefix: ''`) overrides a non-empty global value.

### Schema

#### `project`

| Key                     | Type   | Default                                      | Description                                                                                                                                            |
| ----------------------- | ------ | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `project.slug`          | string | Bare directory name of the working directory | Project identifier used for namespacing artifacts under `{base_dir}/projects/{slug}/`.                                                                 |
| `project.ticket_prefix` | string | `''`                                         | Prefix for bare issue numbers. Use `#` for GitHub issues, a Jira project key like `MAC-` for Jira tickets. Not included in file paths when set to `#`. |

#### `artifacts`

| Key                       | Type   | Default          | Description                                                                                                |
| ------------------------- | ------ | ---------------- | ---------------------------------------------------------------------------------------------------------- |
| `artifacts.base_dir`      | string | `~/ai-artifacts` | Root directory for all generated artifacts (chats, plans, devlogs, tickets, runs). Supports `~` expansion. |
| `artifacts.paths.chats`   | string | `chats`          | Subdirectory name for chat artifacts, relative to the project artifact directory.                          |
| `artifacts.paths.devlogs` | string | `devlogs`        | Subdirectory name for devlog artifacts.                                                                    |
| `artifacts.paths.plans`   | string | `plans`          | Subdirectory name for plan artifacts.                                                                      |

#### `repository`

| Key                                          | Type   | Default  | Description                                                                                     |
| -------------------------------------------- | ------ | -------- | ----------------------------------------------------------------------------------------------- |
| `repository.default_remote[].name`           | string | `origin` | Name of the default git remote.                                                                 |
| `repository.default_remote[].default_branch` | string | `main`   | Default branch of the remote. Combined with the remote name to produce refs like `origin/main`. |
| `repository.slug`                            | string | —        | **Deprecated.** Use `project.slug` instead. Kept as a fallback.                                 |

#### `commit`, `ticket`, `pr` — title prefix conventions

These three sections share the same structure. Each controls the prefix prepended to titles of commits, GitHub issues, and pull requests respectively.

| Key             | Type   | Default | Description                                    |
| --------------- | ------ | ------- | ---------------------------------------------- |
| `commit.prefix` | string | `''`    | Convention template for commit title prefixes. |
| `ticket.prefix` | string | `''`    | Convention template for issue title prefixes.  |
| `pr.prefix`     | string | `''`    | Convention template for PR title prefixes.     |

The prefix value is a **convention template** containing `{scope}` and `{type}` placeholders. The `describe-change.sh` script substitutes scope and type values into the template and appends `: ` to non-empty results.

##### Available conventions

| Convention          | With scope and type                  | With type only               |
| ------------------- | ------------------------------------ | ---------------------------- |
| `'{scope}\|{type}'` | `agents\|feat: Add script installer` | `feat: Add script installer` |
| `'{type}({scope})'` | `feat(agents): Add script installer` | `feat: Add script installer` |
| `'{type}'`          | `feat: Add script installer`         | `feat: Add script installer` |
| `''`                | `Add script installer`               | `Add script installer`       |

When only `--type` is provided (no `--scope`), the output is always `{type}: ` regardless of which convention is configured. When only `--scope` or neither is provided, the output is empty.

##### Examples

Type-only prefix (conventional commits without scope):

```yaml
commit:
  prefix: '{type}'
ticket:
  prefix: '{type}'
pr:
  prefix: '{type}'
```

Produces: `feat: Add script installer`, `fix: Resolve null pointer in parser`

Scope-pipe-type prefix (monorepo convention):

```yaml
commit:
  prefix: '{scope}|{type}'
```

Produces: `agents|feat: Add script installer`, `root|fix: Update lockfile`

Conventional commits with scope in parentheses:

```yaml
commit:
  prefix: '{type}({scope})'
```

Produces: `feat(agents): Add script installer`, `fix(core): Resolve null pointer`

No prefix:

```yaml
commit:
  prefix: ''
```

Produces: `Add script installer`

Mixed — different conventions for commits and PRs:

```yaml
commit:
  prefix: '{scope}|{type}'
pr:
  prefix: '{type}'
```

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
  ticket_prefix: '#'

artifacts:
  base_dir: ~/ai-artifacts
  paths:
    chats: chats
    devlogs: devlogs
    plans: plans

repository:
  default_remote:
    - name: origin
      default_branch: main

commit:
  prefix: '{type}'
ticket:
  prefix: '{type}'
pr:
  prefix: '{type}'

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
