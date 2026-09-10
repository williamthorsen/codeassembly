# Title templates

Commit titles, ticket titles, PR titles, and squash-merge titles are produced from declarative templates. Each surface has its own template, configured per repository and per user, and rendered by `describe-change.mjs` from a small set of named tokens. One compiled template serves both directions: the same template that renders a title reads a rendered title back into its parts.

This file states how a title is rendered and read; [`title-voice.md`](./title-voice.md) states how the `{title}` text fed to these templates is composed.

## Rendering a title

Run the bundle with every input that is available; templates control which tokens are required:

```bash
node {harness_home_dir}/scripts/describe-change.mjs \
  --title "{title}" \
  --scope "{scope}" \
  --type "{type}" \
  --ticket-ref "{ticket_ref}" \
  --pr-number "{pr_number}"
```

The bundle carries no shebang, so the `node` prefix is required.

All flags are optional. Each missing flag means the corresponding token resolves to the empty string. Always quote `--title` so titles with spaces or shell-special characters survive. Add `--breaking` for a breaking change; `--type feat!` is also accepted and splits into the bare type and the marker. A `--scope` of `*` normalizes to no scope, so the sentinel never reaches a rendered title.

The bundle reads `commit.title_format`, `ticket.title_format`, `pr.title_format`, and `merge.title_format` from `.agents/preferences.yaml` at the repository root, then from `~/.agents/preferences.yaml`, falling back to the empty string. Resolution is per key, so a project file naming `commit.title_format` alone still inherits the other three from the global file, and a key present with an empty value opts that surface out.

```yaml
commit:
  title_format: '[[{scope}|]{type}: ]{title}'
ticket:
  title_format: '{title}'
pr:
  title_format: '[{ticket_ref} ]{title}'
merge:
  title_format: '[{ticket_ref} ][[{scope}|]{type}: ]{title}[ (#{pr_number})]'
```

Quote every `title_format` value, single or double quotes alike. Unquoted, YAML reads `{title}` as a flow mapping rather than a token, and a space followed by `#` opens a comment.

Output is JSON:

```json
{
  "commit_title": "agents|feat: Add script installer",
  "ticket_title": "Add script installer",
  "pr_title": "#466 Add script installer",
  "merge_title": "#466 agents|feat: Add script installer (#470)"
}
```

Use `commit_title` for commit titles, `ticket_title` for issue titles, `pr_title` for pull-request titles, and `merge_title` for the squash-merge title shown in the merge UI. Each value is the fully rendered title; do not concatenate it with the bare `title`.

If the bundle is not found, fall back to the bare `--title` value.

### What stops a run and what only warns

- A configured template that the engine cannot invert stops the run, naming the surface, the template, and the defect. See [What the grammar refuses](#what-the-grammar-refuses).
- Malformed YAML in a preferences file stops the run, naming the file.
- A run outside a repository warns on stderr and anchors the `.agents/` lookup at the working directory, so the global templates still render.
- A `title_format` resolving to anything but a string draws a warning on stderr, and the next source supplies the template.

## Reading a title back

`--parse` inverts one surface's template, so a rendered subject reads back into the record that produced it:

```bash
node {harness_home_dir}/scripts/describe-change.mjs --parse commit "agents|feat: Add foo"
```

The output names every field, with `null` where the record carries none:

```json
{
  "breaking": false,
  "matched": true,
  "pr_number": null,
  "scope": "agents",
  "ticket_ref": null,
  "title": "Add foo",
  "type": "feat"
}
```

A subject not matched by the template reports `{"matched":false}` and exits 0. A hand-written subject is an ordinary result rather than an error, so a caller reads `matched` rather than the exit status.

**A type is required.** A template naming `{type}` reads a subject carrying no declared type as unmatched, whatever else the subject carries. Under `[[{scope}|]{type}: ]{title}`, both `agents|Add foo` and `Support a|b: syntax` are unmatched, the second because `b` is no declared type.

**A template naming no `{ticket_ref}` strips one first.** The bundle removes three leading forms before the match: `## `, `#123 ` (with an optional `.1` or `-1` suffix), and `ABC-123 `. These are the forms that release-kit strips, which is what lets a commit template naming no `{ticket_ref}` read a subject that carries one.

**Where a parse could read a group as present or absent, present wins.** This is release-kit's reading, and it is what makes `agents|feat: Add foo` parse as scoped and typed rather than as a bare title. See [What the grammar does not support](#what-the-grammar-does-not-support) for the cost.

## Classifying a commit range

`--classify` reads a range of commits through `commit.title_format` and reports what the branch adds up to. The base ref is the flag's value; the range is `{base-ref}..HEAD`.

```bash
node {harness_home_dir}/scripts/describe-change.mjs --classify origin/main \
  --ticket-label feature --ticket-label scope:agents
```

`--ticket-label` is repeatable and carries the linked ticket's labels. The bundle reverse-looks-up the repository's `.meta/label-map.json` to report which work type they name, so it fetches nothing itself.

```json
{
  "entries": [{ "breaking": false, "commit": "63d2173", "scope": "agents", "title": "Add the parser", "type": "feat" }],
  "head": { "breaking": false, "scope": "agents", "type": "feat" },
  "ticket_type": "feat",
  "unclassified": [{ "commit": "b5ce73f", "subject": "wip" }],
  "violations": [{ "commit": "8d2227d", "policy": "forbidden", "type": "fix" }]
}
```

**`entries` runs oldest first**, in the order the branch was built, and a commit's own trailers keep the order they were written in. One order therefore holds across the whole list, whether an entry came from a subject or from a trailer.

**A merge commit contributes no entry.** Its subject matches no template and its author cannot rewrite it, so reporting it as unclassifiable would train a reader to skim a list that exists to be read. The commits a merge brought in stay in the range on their own.

**A commit carrying `Change:` trailers contributes those entries and not its subject.** A condensed commit's subject is the head its trailers already consolidate to, so reading both would count the branch against itself. See [The `Change:` trailer](./change-record.md#the-change-trailer).

**The head ranks; it does not count.** One `feat` speaks for a branch carrying three `fix` commits, breaking outranks non-breaking, and the tier and listing order in [`work-types.json`](./work-types.json) settle the rest. `head` is `null` where no entry was found, which is how a branch with no classified commits is told from one whose head names no scope. The head names no title: a caller takes that from the change summary.

**A subject no template matched is listed rather than dropped**, so a mistyped prefix stays visible instead of silently shrinking the set the head is derived from.

**A violation is reported and the run continues.** A `fix!`, or a `drop` without its marker, disagrees with the type's `breakingPolicy`. The commit is already written, so refusing here would block the work behind a rebase; the entry is reported as written and never normalized.

**`ticket_type` is `null` where the labels name no type and where they name more than one.** Two type labels on one ticket say that nobody has decided which it is.

The run refuses outright where no taxonomy is readable, since the head has nothing to rank against, and where `commit.title_format` is empty, since no template would match any subject. `--classify` takes no record flags and refuses `--parse`; `--ticket-label` refuses to stand on its own.

## Supported tokens

| Token          | Resolves to                                                                                                            |
| -------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `{scope}`      | Change scope (workspace, package, module). `*` normalizes to empty.                                                    |
| `{type}`       | Work type (`feat`, `fix`, `docs`, …). Renders as `feat!` where the template names no `{breaking}` to carry the marker. |
| `{breaking}`   | The breaking marker `!`; empty for a change that is not breaking.                                                      |
| `{title}`      | Bare title text. Required in every template that should produce a non-empty title.                                     |
| `{ticket_ref}` | Rendered ticket reference (`#466`, `MAC-147`, …); empty when no ticket is associated.                                  |
| `{pr_number}`  | PR number; empty when not yet known. Only meaningful in `merge.title_format`.                                          |

A template that omits `{title}` produces a title without the bare title text: the renderer does not insert it implicitly. Any other `{...}` run is literal text, so a typo such as `{titel}` shows up in the rendered output rather than vanishing.

## Optional groups

A `[...]` group renders verbatim when every token directly inside it resolves non-empty. When one is empty, the whole group drops, literals included.

A group holding both `{scope}` and `{type}` therefore drops the type along with an absent scope, and a `*` scope is absent by the time the group decides. Where the type should survive a scope-less change, nest the scope in a group of its own, as the piped-scope convention does.

`{breaking}` never decides a group. A non-breaking change would otherwise drop the very prefix that carries the marker.

Groups nest, and a nested group decides its own fate. Under `[[{scope}|]{type}: ]{title}`, a change naming no scope keeps its type prefix and renders `feat: Add foo`, while a change naming neither scope nor type renders the bare title.

Write `\[` and `\]` for a literal bracket, and `\\` for a literal backslash.

**No whitespace pass runs.** Output is exactly what the template describes, so each group carries its own separators: write `[{ticket_ref} ]{title}`, not `[{ticket_ref}] {title}`. That exactness is what lets `--parse` invert what the renderer produced.

## The catalogue

Four conventions, each of which round-trips.

| Convention           | Template                                  |
| -------------------- | ----------------------------------------- |
| Bracketed scope      | `[\[{scope}\] ]{type}{breaking}: {title}` |
| Conventional commits | `{type}[({scope})]{breaking}: {title}`    |
| Piped scope          | `[[{scope}\|]{type}: ]{title}`            |
| Type only            | `{type}{breaking}: {title}`               |

Piped scope carries the marker on the type, since it names no `{breaking}`; the other three place the marker immediately before the colon. Piped scope also nests its scope group inside its type group, so a change naming no scope keeps its type prefix.

How they render across the cases that separate them:

| Record                                | Bracketed scope                         | Conventional commits                   | Piped scope                            | Type only                      |
| ------------------------------------- | --------------------------------------- | -------------------------------------- | -------------------------------------- | ------------------------------ |
| scope `agents`, type `feat`           | `[agents] feat: Add foo`                | `feat(agents): Add foo`                | `agents\|feat: Add foo`                | `feat: Add foo`                |
| type `feat`, no scope                 | `feat: Add foo`                         | `feat: Add foo`                        | `feat: Add foo`                        | `feat: Add foo`                |
| scope `agents`, type `drop`, breaking | `[agents] drop!: Remove the legacy API` | `drop(agents)!: Remove the legacy API` | `agents\|drop!: Remove the legacy API` | `drop!: Remove the legacy API` |
| title only                            | `: Add foo`                             | `: Add foo`                            | `Add foo`                              | `: Add foo`                    |

Three of the four name `{type}` outside any group, so a record carrying no type renders a subject opening with a bare colon. Supply a type, or choose piped scope, whose type sits inside a group and drops with it.

## Constraints from release-kit

Because release-kit reads merge subjects to build the changelog, a template whose subjects it must read is bound by what its parser accepts:

- Any ticket reference comes first, in one of the three stripped forms above.
- A pipe separates the scope from the type (`agents|feat:`), or parentheses follow it (`feat(agents):`). The parser reads no bracketed scope, so `[agents] feat: Add foo` is unmatched.
- The breaking marker sits immediately before the colon: `feat!:`, `feat(agents)!:`.
- The type is a run of word characters, so a type carrying a hyphen or a dot goes unread. The parser lowercases the type before matching the taxonomy, so case does not decide the match, and the canonical spelling stays lowercase.

## What the grammar refuses

The bundle checks each configured template when preferences load, and a template that cannot round-trip stops the run, naming the surface, the template, and the defect. It refuses four structural defects:

- **Adjacent tokens.** Two tokens with no literal between them, such as `{scope}{type}`, leave a parse no boundary to split on. `{breaking}` beside another token is exempt, since the marker is a single known character.
- **A repeated token.** A token named twice leaves a parse no way to decide which occurrence a value belongs to.
- **A group boundary that repeats.** An optional group whose opening literal repeats the text before it hides where the group begins.
- **An indistinguishable marker.** `{breaking}` placed beside free text, or beside a literal that spells `!`, leaves the marker unrecognizable.

A render-and-parse pass over well-formed values then backstops the four, so a later extension to the grammar cannot outrun the checker in silence.

## What the grammar does not support

**Value-dependent ambiguity passes the check.** The check runs over well-formed values, so it accepts a template whose ambiguity depends on what a value happens to contain. Under `[{ticket_ref} ]{title}`, the title `#466 Add foo` reads back as ticket reference `#466` and title `Add foo`. That matches how release-kit reads it, so the behavior is compatibility rather than a defect, but a caller holding both halves separately should not rely on a round trip to recover them.

The same cost falls on the piped-scope convention, where a present group wins. `Rename kb|docs: the shared layer` reads back as scope `Rename kb`, type `docs`, title `the shared layer`. The type check rescues a nonsense type, so `Support a|b: syntax` is unmatched, but it cannot rescue a real one.

## Scope values

The `{scope}` token expects a value that identifies the part of the codebase affected. Surface-defined values:

- In a monorepo, the scope is typically the workspace name or abbreviation.
- Use `root` when the change touches only files at the monorepo root.
- Use `*` when the change spans multiple workspaces, or root and one or more workspaces. It normalizes to no scope, so the rendered title carries no scope prefix.

Per-surface guidance on when to apply each value (e.g., what to count as `root` for a commit) is stated by the consuming skill; see the `consult-commit-conventions` skill for the commit-side rules.
