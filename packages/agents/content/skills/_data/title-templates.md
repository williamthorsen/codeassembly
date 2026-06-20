# Title templates

Commit titles, ticket titles, PR titles, and squash-merge titles are produced from declarative templates. Each surface has its own template, configured per repository and per user, and rendered by `describe-change.sh` from a small set of named tokens.

## Rendering the title

Run the `describe-change.sh` script with every input that is available; templates control which tokens are required:

```bash
{harness_home_dir}/scripts/describe-change.sh \
  --title "{title}" \
  --scope "{scope}" \
  --type "{type}" \
  --ticket-ref "{ticket_ref}" \
  --pr-number "{pr_number}"
```

All flags are optional. Each missing flag means the corresponding token resolves to the empty string. Always quote `--title` so titles with spaces or shell-special characters survive.

The script reads `commit.title_format`, `ticket.title_format`, `pr.title_format`, and `merge.title_format` from `.agents/preferences.yaml` (project) then `~/.agents/preferences.yaml` (global), falling back to empty string. It outputs JSON:

```json
{
  "commit_title": "agents|feat: Add script installer",
  "ticket_title": "Add script installer",
  "pr_title": "#466 agents|feat: Add script installer",
  "merge_title": "#466 agents|feat: Add script installer (#470)"
}
```

Use `commit_title` for commit titles, `ticket_title` for issue titles, `pr_title` for pull-request titles, and `merge_title` for the squash-merge title shown in the merge UI. Each value is the fully rendered title — do not concatenate it with the bare `title`.

If the script is not found, fall back to the bare `--title` value.

## Supported tokens

| Token          | Resolves to                                                                           |
| -------------- | ------------------------------------------------------------------------------------- |
| `{scope}`      | Change scope (workspace, package, module).                                            |
| `{type}`       | Work type (`feat`, `fix`, `docs`, …).                                                 |
| `{title}`      | Bare title text. Required in every template that should produce a non-empty title.    |
| `{ticket_ref}` | Rendered ticket reference (`#466`, `MAC-147`, …); empty when no ticket is associated. |
| `{pr_number}`  | PR number; empty when not yet known. Only meaningful in `merge.title_format`.         |

A template that omits `{title}` produces a title without the bare title text — `describe-change.sh` does not insert it implicitly. Unknown tokens (e.g., a typo like `{titel}`) are left as-is so the mistake is visible in the rendered output.

## Optional groups via `[...]`

A `[...]` group renders verbatim if every token reference inside resolves non-empty. If any inner token is empty, the entire group — literals included — drops. Groups are processed left-to-right and may not be nested.

After substitution, a final whitespace pass collapses runs of multiple spaces into a single space and trims leading and trailing whitespace.

### Worked example

Template: `[{ticket_ref} ][{scope}|{type}: ]{title}[ (#{pr_number})]`

| Inputs                       | Output                              |
| ---------------------------- | ----------------------------------- |
| All five tokens populated    | `#466 agents\|feat: Add foo (#470)` |
| No `{ticket_ref}`            | `agents\|feat: Add foo (#470)`      |
| No `{scope}` and no `{type}` | `#466 Add foo (#470)`               |
| No `{pr_number}`             | `#466 agents\|feat: Add foo`        |
| Only `{title}`               | `Add foo`                           |

The whitespace-collapse pass turns `  Add foo  ` into `Add foo` and prevents extra spaces from showing up next to dropped groups (e.g., `[{ticket_ref}] {title} [{pr_number}]` with only `{title}` populated renders as `Add foo`, not `  Add foo  `).

## Common templates

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

Quote `title_format` values in YAML (single or double quotes are both fine). Quoting protects template characters such as `#`, `:`, and `|` from YAML's own parsing rules. In an unquoted value a bare `#` (e.g., `#{pr_number}`) is preserved, but YAML's inline-comment convention — a space immediately followed by `#` — silently truncates the rest of the template. `title_format: {title} # legacy` becomes `{title}` with no warning. When in doubt, quote. The parser does not understand YAML's escape forms for embedded quote characters (`''` inside a single-quoted string, `""` inside a double-quoted string) — if a template needs a literal apostrophe, wrap it in double quotes (or vice versa).

| Template                       | Sample output                        |
| ------------------------------ | ------------------------------------ |
| `'{title}'`                    | `Add script installer`               |
| `'{type}: {title}'`            | `feat: Add script installer`         |
| `'{type}({scope}): {title}'`   | `feat(agents): Add script installer` |
| `'[{scope}\|{type}: ]{title}'` | `agents\|feat: Add script installer` |
| `'[{ticket_ref} ]{title}'`     | `#466 Add script installer`          |
| `'{title} ({ticket_ref})'`     | `Add script installer (#466)`        |

## Scope values

The `{scope}` token expects a value that identifies the part of the codebase affected. Surface-defined values:

- In a monorepo, the scope is typically the workspace name or abbreviation.
- Use `root` when the change touches only files at the monorepo root.
- Use `*` when the change spans multiple workspaces, or root and one or more workspaces.

Per-surface guidance on when to apply each value (e.g., what to count as `root` for a commit) lives with the consuming skill — see `commit/SKILL.md` for the commit-side rules.
