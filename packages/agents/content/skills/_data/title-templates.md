# Title templates

Commit titles, ticket titles, PR titles, and squash-merge titles are produced from declarative templates. Each surface has its own template, configured per repository and per user, and rendered by `describe-change.mjs` from a small set of named tokens. One compiled template serves both directions: the same template that renders a title reads a rendered title back into its parts.

This file states how a title is rendered and read; [`title-voice.md`](./title-voice.md) states how the `{title}` text fed to these templates is composed.

## Configuring the templates

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

## Invoking the bundle

`describe-change.mjs` takes a subcommand as its first argument, followed by that subcommand's arguments:

```bash
node {harness_home_dir}/scripts/describe-change.mjs <subcommand> [flags]
```

The bundle carries no shebang, so the `node` prefix is required. Each subcommand accepts only the flags that its section below lists and refuses any other as unknown, a flag that another subcommand takes included. A missing or unknown subcommand exits non-zero with a usage error that lists the subcommands. A run that succeeds writes one JSON object to stdout, and warnings and errors go to stderr.

| Subcommand                                              | Reports                                                 | Reads                                                       |
| ------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------- |
| [`render-titles`](#render-titles)                       | Each surface's title, rendered from one record          | The templates, and the taxonomy where it is readable        |
| [`parse-title`](#parse-title)                           | A rendered title, read back into its record             | The templates and the taxonomy                              |
| [`consolidate-branch`](#consolidate-branch)             | A commit range's entries and their consolidated record  | The templates, the taxonomy, and the commits                |
| [`resolve-ticket-type`](#resolve-ticket-type)           | The work type that a ticket's labels name               | The label map                                               |
| [`resolve-effective-record`](#resolve-effective-record) | A record with its overrides applied, and its defects    | The taxonomy                                                |
| [`render-block`](#render-block)                         | The `change-record` block that ends a pull-request body | Nothing                                                     |
| [`resolve-merge`](#resolve-merge)                       | What a pull request merges as                           | The templates, the taxonomy, the label map, and the commits |

### What stops a run and what only warns

- A configured template that the engine cannot invert stops every subcommand that reads the templates, naming the surface, the template, and the defect. `resolve-ticket-type`, `resolve-effective-record`, and `render-block` read none, so a defective template does not stop them. See [What the grammar refuses](#what-the-grammar-refuses).
- Malformed YAML in a preferences file stops every subcommand that reads the templates, naming the file.
- An unreadable taxonomy draws a warning from `render-titles`, which then renders from templates that nothing verified, and stops `parse-title`, `consolidate-branch`, `resolve-effective-record`, and `resolve-merge`.
- A subcommand that reads the templates or the label map, run outside a repository, warns on stderr and anchors the `.agents/` and `.meta/label-map.json` lookups at the working directory, so the global templates still render.
- A `title_format` resolving to anything but a string draws a warning on stderr, and the next source supplies the template.

## `render-titles`

`render-titles` renders every surface's title from one record. Run it with every input that is available; templates control which tokens are required:

```bash
node {harness_home_dir}/scripts/describe-change.mjs render-titles \
  --title "{title}" \
  --scope "{scope}" \
  --type "{type}" \
  --ticket-ref "{ticket_ref}" \
  --pr-number "{pr_number}"
```

Its flags are `--title`, `--scope`, `--type`, `--breaking`, `--ticket-ref`, and `--pr-number`, and all are optional. Each missing flag means the corresponding token resolves to the empty string. Always quote `--title` so titles with spaces or shell-special characters survive. Add `--breaking` for a breaking change; `--type feat!` is also accepted and splits into the bare type and the marker. A `--scope` of `*` normalizes to no scope, so the sentinel never reaches a rendered title.

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

## `parse-title`

`parse-title` inverts one surface's template, so a rendered subject reads back into the record that produced it. It takes the surface (`commit`, `ticket`, `pr`, or `merge`) and then the subject as positional arguments, and no flags:

```bash
node {harness_home_dir}/scripts/describe-change.mjs parse-title commit "agents|feat: Add foo"
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

The run refuses a surface whose template is empty, since there is nothing to read the subject through, and refuses where no taxonomy is readable.

## `consolidate-branch`

`consolidate-branch` reads a range of commits through `commit.title_format` and reports the branch's entries and their [consolidated record](./change-record.md#terms). Its one flag, `--base`, is required and names the base ref; the range is `{base-ref}..HEAD`.

```bash
node {harness_home_dir}/scripts/describe-change.mjs consolidate-branch --base origin/main
```

```json
{
  "entries": [
    {
      "breaking": false,
      "change": "agents|feat: Add the parser",
      "commit": "63d2173",
      "scope": "agents",
      "title": "Add the parser",
      "type": "feat"
    }
  ],
  "consolidated_record": { "breaking": false, "scope": "agents", "type": "feat" },
  "unmatched": [{ "commit": "b5ce73f", "subject": "wip" }],
  "violations": [{ "commit": "8d2227d", "policy": "forbidden", "type": "fix" }]
}
```

**`entries` runs oldest first**, in the order the branch was built, and a commit's own trailers keep the order they were written in. One order therefore holds across the whole list, whether an entry came from a subject or from a trailer.

**Each entry's `change` is the entry rendered back through `commit.title_format`.** It is the form that a `Change:` trailer and the change summary's `changes` field take verbatim, and it reads back to the same entry. A ticket reference stripped from the subject does not reappear in it.

**A merge commit contributes no entry.** Its subject matches no template and its author cannot rewrite it, so reporting it as unmatched would train a reader to skim a list that exists to be read. The commits a merge brought in stay in the range on their own.

**A commit carrying `Change:` trailers contributes those entries and not its subject.** A condensed commit's subject renders the record to which its trailers already consolidate, so reading both would count the branch against itself. See [The `Change:` trailer](./change-record.md#the-change-trailer).

**The consolidated record ranks; it does not count.** One `feat` speaks for a branch carrying three `fix` commits, breaking outranks non-breaking, and the tier and listing order in [`work-types.json`](./work-types.json) settle the rest. Every field of `consolidated_record` is `null` when no entry was found, which is how a branch with no entries is told from one whose consolidated record names no scope. The consolidated record names no title: a caller takes that from the change summary.

**A subject no template matched is listed in `unmatched` rather than dropped**, so a mistyped prefix stays visible instead of silently shrinking the set that the consolidated record is derived from.

**A violation is reported and the run continues.** A `fix!`, or a `drop` without its marker, disagrees with the type's `breakingPolicy`. The commit is already written, so refusing here would block the work behind a rebase; the entry is reported as written and never normalized.

The run refuses outright if no taxonomy is readable, since the entries have nothing to rank against, and if `commit.title_format` is empty, since no template would match any subject.

## `resolve-ticket-type`

`resolve-ticket-type` reports the work type that a ticket's labels name. `--ticket-label` is its one flag, repeatable and optional, and carries the linked ticket's labels. The bundle reverse-looks-up the repository's `.meta/label-map.json` to report which work type they name, so it fetches nothing itself.

```bash
node {harness_home_dir}/scripts/describe-change.mjs resolve-ticket-type \
  --ticket-label feature --ticket-label scope:agents
```

```json
{ "ticket_type": "feat" }
```

**`ticket_type` is `null` where the labels name no type and where they name more than one.** Two type labels on one ticket say that nobody has decided which it is. A repository whose label map is absent or unparseable names no type, so its `ticket_type` is `null` as well.

## `resolve-effective-record`

`resolve-effective-record` applies a change summary's overrides to its consolidated record and reports the [effective record](./change-record.md#the-effective-record) with its defects. The record comes from `--title`, `--scope`, `--type`, and `--breaking`, and the author's overrides from `--override-scope`, `--override-type`, and `--override-breaking`. Every flag is optional.

```bash
node {harness_home_dir}/scripts/describe-change.mjs resolve-effective-record \
  --scope agents --type feat --title "Add the parser" \
  --override-type sec --override-breaking
```

```json
{
  "effective_record": {
    "title": "Add the parser",
    "scope": "agents",
    "type": "sec",
    "breaking": true,
    "ticket_ref": null,
    "pr_number": null
  },
  "defects": []
}
```

**`effective_record` holds every field of a record.** `ticket_ref` and `pr_number` are always `null`, since only a merge knows them. Any other field that neither the record nor an override sets is `null`, apart from `breaking`, which is then `false`.

**`defects` lists what would block approval of the effective record**:

| Kind               | Meaning                                                                                  |
| ------------------ | ---------------------------------------------------------------------------------------- |
| `missing-type`     | The effective record names no type.                                                      |
| `undeclared-type`  | `work-types.json` does not declare the effective type; `type` names it.                  |
| `policy-violation` | The breaking marker disagrees with the type's `breakingPolicy`; `policy` names the rule. |

`--type feat!` is accepted and splits into the bare type and the marker. `--override-type` takes a bare type and refuses one spelled with `!`; pass `--override-breaking` for a breaking override. An override flag whose value is blank sets no override. The run reads no title template and no repository, so a defective template does not stop it, and it refuses if no taxonomy is readable.

## `render-block`

`render-block` renders the fenced `change-record` block that ends a pull-request body. `--title` is required. The consolidated record comes from `--scope`, `--type`, and `--breaking`, and the author's overrides from `--override-scope`, `--override-type`, and `--override-breaking`; each of these is optional.

```bash
node {harness_home_dir}/scripts/describe-change.mjs render-block \
  --scope agents --type feat --title "Add the parser" \
  --override-type sec --override-breaking
```

The output is JSON whose `block` holds the fenced block, fences included:

````json
{
  "block": "```change-record\ntitle: Add the parser\nconsolidated_record:\n  scope: agents\n  type: feat\noverrides:\n  type: sec\n  breaking: true\n```"
}
````

The run refuses a missing or blank `--title`. `--type feat!` is accepted and splits into the bare type and the marker. `--override-type` takes a bare type and refuses one spelled with `!`; pass `--override-breaking` for a breaking override. [The `change-record` block](./change-record.md#the-change-record-block) states the block's grammar, and [The effective record](./change-record.md#the-effective-record) states how a reader applies the overrides.

## `resolve-merge`

`resolve-merge` reports what a pull request merges as. `--base` names the base ref of the pull request's range, the pull request supplies the rest, and the author's choices at the approval gate arrive as overrides.

```bash
node {harness_home_dir}/scripts/describe-change.mjs resolve-merge \
  --base origin/main \
  --head 63d2173e5f0c9a7b1d4e8f2a6c0b3d5e7f9a1c2b \
  --pr-number 470 \
  --pr-title "#466 Add the parser" \
  --pr-body-file {body_file} \
  --pr-label feature --pr-label scope:agents \
  --ticket-ref "#466"
```

`--base`, `--head`, `--pr-number`, `--pr-title`, and `--pr-body-file` are required. `--head` is the pull request's head commit. The commits are read from the local repository, so the head commit must be there for them to be read, and it need not be checked out. `--pr-number` takes digits alone. `--pr-body-file` names a file holding the pull-request body, which is multi-line Markdown. `--pr-label` is repeatable. `--ticket-ref` is the reference that applies where the pull-request title carries none. The overrides are `--override-scope`, `--override-type`, `--override-breaking` or `--no-override-breaking`, and `--override-title`.

```json
{
  "effective_record": {
    "title": "Add the parser",
    "scope": "agents",
    "type": "feat",
    "breaking": false,
    "ticket_ref": "#466",
    "pr_number": "470"
  },
  "effective_sources": {
    "title": "pr_title",
    "scope": "commits",
    "type": "commits",
    "breaking": "commits",
    "ticket_ref": "pr_title"
  },
  "merge_title": "#466 agents|feat: Add the parser (#470)",
  "body": "- Adds the parser.",
  "sources": {
    "block": {
      "title": "Add the parser",
      "consolidated_record": { "scope": "agents", "type": "fix", "breaking": false },
      "overrides": {}
    },
    "commits": { "scope": "agents", "type": "feat", "breaking": false },
    "labels": { "scope": "agents", "type": "feat", "breaking": false },
    "pr_title": { "title": "Add the parser", "ticket_ref": "#466", "scope": null, "type": null, "breaking": null }
  },
  "defects": [],
  "notices": [{ "kind": "divergence", "sources": ["block", "commits"], "fields": ["type"] }]
}
```

**`effective_record` is the [effective record](./change-record.md#terms) that the merge settles on**, resolved as [Where the record is read](./change-record.md#where-the-record-is-read) states. It holds every field of a record, since `merge_title` renders from it. A field that nothing sets is `null`, apart from `breaking`, which is then `false`.

**`effective_sources` names what supplied each field of `effective_record`**, apart from `pr_number`, which `--pr-number` supplies:

| Value               | Supplied by                                                                                                                               |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `block`             | The block's consolidated record, where the commits agree with it or cannot be read, or the block's title, where the title does not invert |
| `block_overrides`   | An override that the block records                                                                                                        |
| `commits`           | The record to which the commits consolidate                                                                                               |
| `flags`             | The invocation's overrides, and `--ticket-ref`                                                                                            |
| `labels`            | The pull request's labels                                                                                                                 |
| `pr_title`          | The pull-request title, inverted through `pr.title_format`                                                                                |
| `pr_title_verbatim` | The pull-request title as given, where it does not invert and no block is readable                                                        |

Each field names the step that set it last, as [Where the record is read](./change-record.md#where-the-record-is-read) orders the steps, so a field that an override sets names the override even where it repeats the value that it replaces. A field is `null` where nothing supplied it: a `ticket_ref` that neither the title nor `--ticket-ref` names, and, without a readable block, a field that no label resolves while the commits cannot be read.

**`sources` reports what each source names**, whether or not the resolution used it. A source is `null` only where it was not read: `block` where the body carries no block or a malformed one, `commits` where the commits cannot be read, and `pr_title` where the title does not invert. Within a record, a field that the source does not determine is `null`, `breaking` included.

- `block` mirrors the block as read: its `title`, its `consolidated_record`, which is `null` where the block holds none and whose `breaking` is `false` where the block omits it, and its `overrides`, which lists only the keys that are set.
- `commits` is the record to which the commits between `--base` and `--head` consolidate. Every field is `null` where the range holds no entry.
- `labels` is the record that the labels name, and is never `null`. `type` and `scope` each resolve where exactly one label of their section names a key. `breaking` is `true` with the `breaking` label, `false` where a type label resolves without it, and `null` otherwise.
- `pr_title` is the record that the pull-request title carries: the bare `title` and the `ticket_ref`, and the `scope`, `type`, and `breaking` of any typed prefix, each `null` where the title carries no prefix. It is read under `--override-title` too.

**The bare title** comes from `--override-title`, then from the pull-request title inverted through `pr.title_format`, then from the block's title, then from the pull-request title as given. A scope and type read from the pull-request title, through `pr.title_format` where it names `{type}` and otherwise through `commit.title_format`, never stay in the bare title. `ticket_ref` comes from the pull-request title, then from `--ticket-ref`. `merge_title` renders `effective_record` through `merge.title_format`, the marker included, and falls back to the bare title where that template is empty.

**`body` is the merge body**: the `## What` section, without any `change-record` block and without the trailing lines that hold only a closing keyword (`close`, `fix`, `resolve`, and their inflections) and ticket references.

**`defects` block approval.** Each names a condition of `effective_record` that the author must override before the merge is offered, with the kinds that [`resolve-effective-record`](#resolve-effective-record) lists.

**`notices` inform the gate** and block nothing:

| Kind                  | Meaning                                                                                                                                                                                                                                                                             |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `malformed-block`     | The body's last block cannot be read; `defect` names why, and the merge resolves as though no block were present.                                                                                                                                                                   |
| `commits-unavailable` | The commits cannot be read; `reason` names why, and the block or the labels stand unchecked.                                                                                                                                                                                        |
| `divergence`          | Before any override, the block's consolidated record, or the record chosen from the labels, disagrees with the commits'. `sources` names the two, `block` or `labels` and then `commits`, and `fields` lists the fields among `scope`, `type`, and `breaking` on which they differ. |
| `pr-title-divergence` | The pull-request title's typed prefix differs from `effective_record`; `fields` lists the fields on which they differ. It is raised under `--override-title` too.                                                                                                                   |
| `pr-title-unparsed`   | The pull-request title does not invert through `pr.title_format`; `effective_sources.title` names what stands in.                                                                                                                                                                   |

**Each override outranks every source on its own field**, as [The effective record](./change-record.md#the-effective-record) states; `--no-override-breaking` removes the marker. `--override-title` replaces the bare title, and the pull-request title's prefix is still read and compared.

**A head commit that the local repository lacks is not an error.** The run reports `commits-unavailable` and resolves from the block or the labels, so fetch the head commit before resolving. Any other git failure stops the run.

The run refuses where no taxonomy is readable and where the body file cannot be read. An empty `commit.title_format` reports `commits-unavailable` rather than refusing. `--override-type` refuses a type spelled with `!`, and `--override-breaking` and `--no-override-breaking` refuse to appear together.

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

**No whitespace pass runs.** Output is exactly what the template describes, so each group carries its own separators: write `[{ticket_ref} ]{title}`, not `[{ticket_ref}] {title}`. That exactness is what lets `parse-title` invert what the renderer produced.

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
