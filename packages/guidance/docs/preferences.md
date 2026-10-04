# Preferences

The reference for the keys of `.agents/preferences.yaml`. The [README](../README.md#preferences) describes the resolution cascade that applies to every key.

## Schema

### `project`

| Key                         | Type   | Default                                      | Description                                                                                                                                                                                                                            |
| --------------------------- | ------ | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `project.slug`              | string | Bare directory name of the working directory | Project identifier used for namespacing artifacts under `{base_dir}/projects/{slug}/`.                                                                                                                                                 |
| `project.ticket_ref_prefix` | string | `''`                                         | Prefix that appears at the start of `ticket_ref`. Use `#` for GitHub issues (added at render time, omitted from file paths) or a Jira project key like `MAC-` (part of the canonical ticket ID, included in file paths and templates). |

### `artifacts`

| Key                       | Type   | Default          | Description                                                                                                |
| ------------------------- | ------ | ---------------- | ---------------------------------------------------------------------------------------------------------- |
| `artifacts.base_dir`      | string | `~/ai-artifacts` | Root directory for all generated artifacts (chats, plans, devlogs, tickets, runs). Supports `~` expansion. |
| `artifacts.paths.chats`   | string | `chats`          | Subdirectory name for chat artifacts, relative to the project artifact directory.                          |
| `artifacts.paths.devlogs` | string | `devlogs`        | Subdirectory name for devlog artifacts.                                                                    |
| `artifacts.paths.plans`   | string | `plans`          | Subdirectory name for plan artifacts.                                                                      |

### `repository`

| Key                                        | Type   | Default  | Description                                                                                     |
| ------------------------------------------ | ------ | -------- | ----------------------------------------------------------------------------------------------- |
| `repository.default_remote.name`           | string | `origin` | Name of the default git remote.                                                                 |
| `repository.default_remote.default_branch` | string | `main`   | Default branch of the remote. Combined with the remote name to produce refs like `origin/main`. |
| `repository.slug`                          | string | —        | **Deprecated.** Use `project.slug` instead. Kept as a fallback.                                 |

### `commit`, `ticket`, `pr`, `merge`: title format conventions

These four sections share the same structure. Each holds a declarative template that `describe-change.mjs` renders into the title for the corresponding surface (commit, GitHub issue, pull request, and squash-merge commit).

| Key                   | Type   | Default | Description                                 |
| --------------------- | ------ | ------- | ------------------------------------------- |
| `commit.title_format` | string | `''`    | Template for commit titles.                 |
| `ticket.title_format` | string | `''`    | Template for issue titles.                  |
| `pr.title_format`     | string | `''`    | Template for pull-request titles.           |
| `merge.title_format`  | string | `''`    | Template for the squash-merge commit title. |

A template is a string containing literal text and any combination of the supported tokens listed below, with optional `[...]` groups for parts that should drop when their tokens are empty. An empty template is the explicit way to opt out: The corresponding rendered title will be the empty string. The `describe-change.mjs` script outputs JSON with `commit_title`, `ticket_title`, `pr_title`, and `merge_title`.

#### Supported tokens

| Token          | Resolves to                                                                                                                 |
| -------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `{scope}`      | Change scope (workspace, package, module), one name or several joined by commas. `*` normalizes to empty.                   |
| `{type}`       | Work type (`feat`, `fix`, `docs`, …). Includes the breaking marker itself (`feat!`) unless the template names `{breaking}`. |
| `{breaking}`   | The breaking marker `!`, empty for a change that is not breaking.                                                           |
| `{title}`      | Bare title text. Required in every template that should produce a non-empty title.                                          |
| `{ticket_ref}` | Rendered ticket reference (`#466`, `MAC-147`, …); empty when the change isn't associated with a ticket.                     |
| `{pr_number}`  | PR number; empty when not yet known. Only meaningful in `merge.title_format`.                                               |

A template that omits `{title}` will not have it inserted implicitly; unknown tokens (e.g., `{titel}`) are left as-is so that typos surface in the output.

Quote `title_format` values in YAML (single or double quotes are both fine). Quoting protects template characters such as `{`, `#`, `:`, and `|` from YAML's own parsing rules: Unquoted, `{title}` opens a flow mapping rather than naming a token, and a space followed by `#` opens a comment. A value that resolves to anything but a string is reported and skipped, so a misquoted template falls through to the next source rather than rendering as written.

#### Optional groups

A `[...]` group renders verbatim if every token directly inside it resolves non-empty. If one is empty, the entire group (literals included) drops. `{breaking}` never decides a group, so a non-breaking change keeps the prefix that would include the marker. Groups nest, and a nested group is kept or dropped on its own: Under `[[{scope}|]{type}: ]{title}`, a change without a scope still renders `feat: Add foo`. A flat group holding both tokens takes the type down with an absent scope instead, and a `*` scope is absent by the time the group decides. A template that should keep its type nests the scope in a group of its own. Write `\[` and `\]` for a literal bracket.

`describe-change.mjs` doesn't run a whitespace pass after substitution, so each group contains its own separators: `[{ticket_ref} ]{title}`, not `[{ticket_ref}] {title}`. That lets `describe-change.mjs` read a rendered title back into the record that produced it, and read a whole commit range back through `commit.title_format`. See [title-templates.md](../content/skills/_data/title-templates.md) for how to invoke `describe-change.mjs` and what each of its subcommands reports, and [change-record.md](../content/skills/_data/change-record.md) for how a consolidated record is written down and read back.

A template that cannot round-trip is refused when preferences load, naming the surface, the template, and the defect: two adjacent tokens without a literal between them, a token named twice, an optional group whose opening literal repeats the text before it, or a `{breaking}` placed where the `!` cannot be told from its neighbour.

Example template: `[{ticket_ref} ][{scope}|{type}: ]{title}[ (#{pr_number})]`

| Inputs                    | Output                              |
| ------------------------- | ----------------------------------- |
| All five tokens populated | `#466 agents\|feat: Add foo (#470)` |
| No `{ticket_ref}`         | `agents\|feat: Add foo (#470)`      |
| No `{scope}`              | `#466 Add foo (#470)`               |
| No `{pr_number}`          | `#466 agents\|feat: Add foo`        |
| Only `{title}`            | `Add foo`                           |

#### Examples

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
  title_format: '[[{scope}|]{type}: ]{title}'
```

Produces: `agents|feat: Add script installer` with both present, `feat: Add script installer` without a scope, and `Add script installer` without a type. Nesting the scope in a group of its own keeps the type when the scope drops; a flat `[{scope}|{type}: ]` takes the type down with it.

Conventional commits with scope in parentheses:

```yaml
commit:
  title_format: '{type}[({scope})]{breaking}: {title}'
```

Produces: `feat(agents): Add script installer`, and `feat: Add script installer` without a scope.

Squash-merge convention (the typical shape that this repo uses):

```yaml
commit:
  title_format: '[[{scope}|]{type}: ]{title}'
ticket:
  title_format: '{title}'
pr:
  title_format: '[{ticket_ref} ][[{scope}|]{type}: ]{title}'
merge:
  title_format: '[{ticket_ref} ][[{scope}|]{type}: ]{title}[ (#{pr_number})]'
```

Produces (for `--scope agents --type feat --title 'Add foo' --ticket-ref '#466' --pr-number 470`):

- `commit_title`: `agents|feat: Add foo`
- `ticket_title`: `Add foo`
- `pr_title`: `#466 agents|feat: Add foo`
- `merge_title`: `#466 agents|feat: Add foo (#470)`

#### Scope values

- In a monorepo, the scope is the workspace name or abbreviation.
- `root`: commit touches only files in the monorepo root.
- `*`: commit spans multiple workspaces, with or without root.
- `agents,kb`: a change entry that belongs to several workspaces names them joined by commas. Normalization trims each name and drops the empty ones, the `*` ones, and the duplicates; consolidation counts each named workspace separately, sets aside process-tier entries' scopes when a higher-tier entry names a scope, and then sets `root` aside when the remaining scopes also name a workspace. The scope labels keep a process-tier entry's workspace.
- A root change tightly associated with one workspace (e.g., lockfile updated by a dependency added to that workspace) uses the workspace scope, not `root`.

#### Breaking changes

Append `!` after the type: `agents|feat!: Remove deprecated API`

### `integrations`

| Key                             | Type    | Default                                                  | Description                                                                                                                                                                     |
| ------------------------------- | ------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `integrations.jira.enabled`     | boolean | `false`                                                  | Enable Jira integration for ticket creation and referencing.                                                                                                                    |
| `integrations.jira.issue_types` | object  | none                                                     | Maps work-type keys and aliases to Jira issue-type names, plus a `default` entry covering every unmapped work type. A work type matching neither falls back to the `Task` type. |
| `integrations.jira.project_key` | string  | `project.ticket_ref_prefix` minus its trailing separator | Key of the Jira project to create work items in. Set it when the derivation is wrong or when `ticket_ref_prefix` is absent.                                                     |

### `editors`

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

## Full example

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
  title_format: '[[{scope}|]{type}: ]{title}'
ticket:
  title_format: '{title}'
pr:
  title_format: '[{ticket_ref} ][[{scope}|]{type}: ]{title}'
merge:
  title_format: '[{ticket_ref} ][[{scope}|]{type}: ]{title}[ (#{pr_number})]'

integrations:
  jira:
    enabled: false
    issue_types:
      default: Task
      feat: Story
      fix: Bug
    project_key: MAC

editors:
  - name: WebStorm
    command: webstorm
    extensions: '*.md'
```
