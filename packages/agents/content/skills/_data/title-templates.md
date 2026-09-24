# Title templates

Commit titles, ticket titles, PR titles, and squash-merge titles are produced from declarative templates. Each surface has its own template, configured per repository and per user, and rendered by `describe-change.mjs` from a small set of named tokens. One compiled template serves both directions: The same template that renders a title reads a rendered title back into its parts.

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

Quote every `title_format` value, single or double quotes alike. Without quotes, YAML reads `{title}` as a flow mapping rather than a token, and a space followed by `#` opens a comment.

## Invoking the bundle

`describe-change.mjs` takes a subcommand as its first argument, followed by that subcommand's arguments:

```bash
node {harness_home_dir}/scripts/describe-change.mjs <subcommand> [flags]
```

The bundle has no shebang, so the `node` prefix is required. Each subcommand accepts only the flags that its section below lists and refuses any other as unknown, including a flag that another subcommand takes. A run with a missing or unknown subcommand exits non-zero with a usage error that lists the subcommands. A run that succeeds writes one JSON object to stdout, and warnings and errors go to stderr.

| Subcommand                                              | Reports                                                 | Reads                                                       |
| ------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------- |
| [`render-titles`](#render-titles)                       | Each surface's title, rendered from one record          | The templates, and the taxonomy when it is readable         |
| [`parse-title`](#parse-title)                           | A rendered title, read back into its record             | The templates and the taxonomy                              |
| [`consolidate-branch`](#consolidate-branch)             | A commit range's entries and their consolidated record  | The templates, the taxonomy, and the commits                |
| [`consolidate-entries`](#consolidate-entries)           | The record to which a change's entries consolidate      | The taxonomy and the entries file                           |
| [`resolve-ticket-type`](#resolve-ticket-type)           | The work type that a ticket's labels name               | The label map                                               |
| [`resolve-effective-record`](#resolve-effective-record) | A record with its overrides applied, and its defects    | The taxonomy                                                |
| [`render-block`](#render-block)                         | The `change-record` block that ends a pull-request body | Nothing                                                     |
| [`resolve-merge`](#resolve-merge)                       | What a pull request merges as                           | The templates, the taxonomy, the label map, and the commits |
| [`check-merge-body`](#check-merge-body)                 | The entry count that a composed merge body records      | The body file                                               |
| [`amend-entry`](#amend-entry)                           | One change entry, amended in a pull-request body        | The taxonomy and the body file, which it rewrites           |
| [`resolve-scopes`](#resolve-scopes)                     | The scope that owns each given path                     | The workspace layout                                        |
| [`resolve-labels`](#resolve-labels)                     | The labels for a change                                 | The body file and the label map                             |

### What stops a run and what only warns

- A configured template that the engine cannot invert stops every subcommand that reads the templates, naming the surface, the template, and the defect. `resolve-ticket-type`, `resolve-effective-record`, `render-block`, `consolidate-entries`, `check-merge-body`, `amend-entry`, `resolve-scopes`, and `resolve-labels` read none, so a defective template does not stop them. See [What the grammar refuses](#what-the-grammar-refuses).
- Malformed YAML in a preferences file stops every subcommand that reads the templates, naming the file.
- Malformed YAML in `pnpm-workspace.yaml` stops `resolve-scopes`, naming the file.
- A malformed `change-record` block in the body file causes a warning from `resolve-labels`, which then labels the change from the flags alone.
- An unreadable taxonomy causes a warning from `render-titles`, which then renders from templates that nothing verified, and stops `parse-title`, `consolidate-branch`, `consolidate-entries`, `resolve-effective-record`, `resolve-merge`, and `amend-entry`.
- Outside a repository, a subcommand that anchors at the repository root warns on stderr and anchors at the working directory instead: the `.agents/` and `.meta/label-map.json` lookups, so the global templates still render, and `resolve-scopes`'s workspace discovery, which then finds none.
- A `title_format` resolving to anything but a string causes a warning on stderr, and the next source supplies the template.

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

Its flags are `--title`, `--scope`, `--type`, `--breaking`, `--ticket-ref`, and `--pr-number`, and all are optional. Each missing flag means the corresponding token resolves to the empty string. Always quote `--title` so that titles with spaces or shell-special characters are passed intact. Add `--breaking` for a breaking change; `--type feat!` is also accepted and splits into the bare type and the marker. A `--scope` of `*` normalizes to no scope, so the sentinel never appears in a rendered title.

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

The output names every field, with `null` for any field that the record lacks:

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

For a subject not matched by the template, the run reports `{"matched":false}` and exits 0. A hand-written subject is an ordinary result rather than an error, so a caller reads `matched` rather than the exit status.

**A type is required.** A template naming `{type}` reads a subject that contains no declared type as unmatched, whatever else the subject contains. Under `[[{scope}|]{type}: ]{title}`, both `agents|Add foo` and `Support a|b: syntax` are unmatched, the second because `b` is no declared type.

**Under a template naming no `{ticket_ref}`, the bundle strips one first.** The bundle removes three leading forms before the match: `## `, `#123 ` (with an optional `.1` or `-1` suffix), and `ABC-123 `. These are the forms that release-kit strips, which lets a commit template naming no `{ticket_ref}` read a subject that contains one.

**When a parse could read a group as present or absent, present wins.** This is release-kit's reading, and it makes `agents|feat: Add foo` parse as scoped and typed rather than as a bare title. See [What the grammar does not support](#what-the-grammar-does-not-support) for the cost.

The run refuses a surface whose template is empty, since there is nothing to read the subject through, and refuses if no taxonomy is readable.

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
    },
    {
      "breaking": true,
      "change": "agents|refactor!: Restructure the guard",
      "commit": "8d2227d",
      "scope": "agents",
      "title": "Restructure the guard",
      "type": "refactor"
    }
  ],
  "consolidated_record": { "breaking": true, "scope": "agents", "type": "refactor" },
  "unmatched": [{ "commit": "b5ce73f", "subject": "wip" }],
  "violations": [{ "commit": "8d2227d", "policy": "forbidden", "type": "refactor" }]
}
```

**`entries` runs oldest first**, in the order the branch was built, and a commit's own trailers keep the order in which they were written. One order therefore holds across the whole list, whether an entry came from a subject or from a trailer.

**Each entry's `change` is the entry rendered back through `commit.title_format`.** It is the form that a `Change:` trailer and the change summary's `changes` field take verbatim, and it reads back to the same entry. A ticket reference stripped from the subject does not reappear in it.

**A merge commit contributes no entry.** Its subject matches no template and its author cannot rewrite it, so reporting it as unmatched would train a reader to skim a list that exists to be read. The commits brought in by a merge stay in the range on their own.

**A commit with `Change:` trailers contributes those entries and not its subject.** Because a condensed commit's subject renders the record to which its trailers already consolidate, reading both would count the branch's entries twice. See [The `Change:` trailer](./change-record.md#the-change-trailer).

**The consolidated record ranks; it does not count.** One `feat` outranks three `fix` commits on the same branch, breaking outranks non-breaking, and the tier and listing order in [`work-types.json`](./work-types.json) settle the rest. Every field of `consolidated_record` is `null` when no entry was found, which is how a caller distinguishes a branch with no entries from one whose consolidated record names no scope. The consolidated record names no title: A caller takes that from the change summary.

**A subject matched by no template is listed in `unmatched` rather than dropped**, so a mistyped prefix stays visible instead of silently shrinking the set that the consolidated record is derived from.

**A violation is reported and the run continues.** A `refactor!`, or a `drop` without its marker, disagrees with the type's `breakingPolicy`. Because the commit is already written, refusing here would block the work until a rebase; the entry is reported as written and never normalized.

The run refuses outright if no taxonomy is readable, since the entries have nothing to rank against, and if `commit.title_format` is empty, since no template would match any subject.

## `consolidate-entries`

`consolidate-entries` reports the record to which a change's [change entries](./change-record.md#terms) consolidate. Its one flag, `--entries-file`, is required and names a YAML file holding a top-level list of entry mappings, in the shape that `entry-drafter` returns.

```bash
node {harness_home_dir}/scripts/describe-change.mjs consolidate-entries --entries-file entries-20260920-223418Z.yaml
```

```yaml
- type: feat
  scopes: [agents, kb]
  breaking: false
  text: Adds the store-qualified wikilink `[[store:Note title]]`, which `kb check` resolves against the named store.
- type: fix
  scopes: [agents]
  breaking: false
  text: Stops the sync from deleting a subagent that the run had just written.
```

```json
{ "consolidated_record": { "breaking": false, "scope": "agents", "type": "feat" } }
```

**Each entry expands to one record per scope**, and an entry naming no scope expands to one record with no scope, which keeps a change touching nothing scoped rankable on its type. The expanded list is then ranked exactly as `consolidate-branch` ranks the commit entries, so one rule serves both sources: breaking outranks non-breaking, then the tier and listing order in [`work-types.json`](./work-types.json), and exactly one distinct scope survives.

**An entry whose `type` the taxonomy does not declare is left as written and is unrankable**, so it contributes no type, as an unrankable commit entry does. Every field of `consolidated_record` is `null` for an empty list, which is how a caller distinguishes a change with no entries from one whose consolidated record names no scope.

**The entries arrive in a file rather than through flags** because `text` is arbitrary prose containing backticks and quotes, which a shell argument would expand or truncate.

The run refuses an entries file that cannot be read, that is not valid YAML, or that is malformed, naming the defect: a value that is not a list, an item that is not a mapping, a missing or blank `type` or `text`, a `breaking` that is not a boolean, a `scopes` that is not a list of strings, and a `migration` that is not a string or spans more than one line. A blank or null `migration` reads as absent, and a key that the grammar does not declare is ignored. It also refuses outright if no taxonomy is readable, since the entries have nothing to rank against.

## `resolve-ticket-type`

`resolve-ticket-type` reports the work type that a ticket's labels name. `--ticket-label` is its one flag, repeatable and optional, and takes the linked ticket's labels. The bundle reverse-looks-up the repository's `.meta/label-map.json` to report which work type they name, so it fetches nothing itself.

```bash
node {harness_home_dir}/scripts/describe-change.mjs resolve-ticket-type \
  --ticket-label feature --ticket-label scope:agents
```

```json
{ "ticket_type": "feat" }
```

**`ticket_type` is `null` when the labels name no type and when they name more than one.** Two type labels on one ticket say that nobody has decided which it is. Because a repository whose label map is absent or unparseable names no type, its `ticket_type` is `null` as well.

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

**`effective_record` contains every field of a record.** `ticket_ref` and `pr_number` are always `null`, since only a merge supplies them. Any other field that neither the record nor an override sets is `null`, apart from `breaking`, which is then `false`.

**`defects` lists what would block approval of the effective record**:

| Kind               | Meaning                                                                                  |
| ------------------ | ---------------------------------------------------------------------------------------- |
| `missing-type`     | The effective record names no type.                                                      |
| `undeclared-type`  | `work-types.json` does not declare the effective type; `type` names it.                  |
| `policy-violation` | The breaking marker disagrees with the type's `breakingPolicy`; `policy` names the rule. |

`--type feat!` is accepted and splits into the bare type and the marker. `--override-type` takes a bare type and refuses one spelled with `!`; pass `--override-breaking` for a breaking override. An override flag whose value is blank sets no override. The run reads no title template and no repository, so a defective template does not stop it, and it refuses if no taxonomy is readable.

## `render-block`

`render-block` renders the fenced `change-record` block that ends a pull-request body. `--title` is required. The author's overrides come from `--override-scope`, `--override-type`, and `--override-breaking`. The change entries come from `--entries-file`, naming the same YAML file that [`consolidate-entries`](#consolidate-entries) takes, and `--entries-commit` names the commit at which they were derived. Each of these is optional.

```bash
node {harness_home_dir}/scripts/describe-change.mjs render-block \
  --title "Add the parser" \
  --override-type sec --override-breaking \
  --entries-file entries-20260920-223418Z.yaml --entries-commit e5029924
```

The output is JSON whose `block` contains the fenced block, fences included:

````json
{
  "block": "```change-record\ntitle: Add the parser\noverrides:\n  type: sec\n  breaking: true\nentries_commit: e5029924\nentries:\n  - type: feat\n    scopes: [agents]\n    text: Adds the parser\n```"
}
````

**The run reads no taxonomy.** The block records the entries rather than a record ranked from them; [`resolve-merge`](#resolve-merge) ranks them at merge.

The run refuses a missing or blank `--title`, and a blank `--entries-file` or `--entries-commit`. It refuses `--entries-commit` without `--entries-file`, since a derivation commit with nothing derived at it records a claim about nothing, and it refuses an entries file that cannot be read, that is not valid YAML, or that is malformed, exactly as `consolidate-entries` does. `--override-type` takes a bare type and refuses one spelled with `!`; pass `--override-breaking` for a breaking override. [The `change-record` block](./change-record.md#the-change-record-block) states the block's grammar, and [The effective record](./change-record.md#the-effective-record) states how a reader applies the overrides.

## `resolve-merge`

`resolve-merge` reports what a pull request merges as. `--base` names the base ref of the pull request's range, the pull request supplies the rest, and the author's choices at the approval gate are passed as overrides.

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

`--base`, `--head`, `--pr-number`, `--pr-title`, and `--pr-body-file` are required. `--head` is the pull request's head commit. The commits are read from the local repository, so the head commit must be there for them to be read, and it need not be checked out. `--pr-number` takes digits alone. `--pr-body-file` names a file containing the pull-request body, which is multi-line Markdown. `--pr-label` is repeatable. `--ticket-ref` is the ticket reference to be used when the pull-request title does not contain one. The overrides are `--override-scope`, `--override-type`, `--override-breaking` or `--no-override-breaking`, and `--override-title`.

````json
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
    "scope": "block",
    "type": "block",
    "breaking": "block",
    "ticket_ref": "pr_title"
  },
  "merge_title": "#466 agents|feat: Add the parser (#470)",
  "body": "- Adds the parser.",
  "merge_block": "```change-record\npr_number: 470\nticket_ref: \"#466\"\nentries:\n  - type: feat\n    scopes: [agents]\n    text: Adds the parser\n```",
  "entry_count": 1,
  "sources": {
    "block": {
      "title": "Add the parser",
      "overrides": {},
      "entries_commit": "e5029924",
      "entries": [{ "type": "feat", "scopes": ["agents"], "breaking": false, "text": "Adds the parser" }]
    },
    "commits": { "scope": "agents", "type": "fix", "breaking": false },
    "labels": { "scope": "agents", "type": "feat", "breaking": false },
    "pr_title": { "title": "Add the parser", "ticket_ref": "#466", "scope": null, "type": null, "breaking": null }
  },
  "defects": [],
  "notices": []
}
````

**`effective_record` is the [effective record](./change-record.md#terms) that the merge settles on**, resolved as [Where the record is read](./change-record.md#where-the-record-is-read) states. It contains every field of a record, since `merge_title` renders from it. A field that nothing sets is `null`, apart from `breaking`, which is then `false`.

**`effective_sources` names what supplied each field of `effective_record`**, apart from `pr_number`, which `--pr-number` supplies:

| Value               | Supplied by                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------ |
| `block`             | The record ranked from the block's entries, or the block's title, when the title does not invert |
| `block_overrides`   | An override that the block records                                                               |
| `commits`           | The record to which the commits consolidate                                                      |
| `flags`             | The invocation's overrides, and `--ticket-ref`                                                   |
| `labels`            | The pull request's labels                                                                        |
| `pr_title`          | The pull-request title, inverted through `pr.title_format`                                       |
| `pr_title_verbatim` | The pull-request title as given, when it does not invert and no block is readable                |

Each field names the step that set it last, as [Where the record is read](./change-record.md#where-the-record-is-read) orders the steps, so a field that an override sets names the override even when it repeats the value that it replaces. A field is `null` when nothing supplied it: a `ticket_ref` that neither the title nor `--ticket-ref` names, and, without entries to rank, a field that no label resolves while the commits cannot be read.

**`sources` reports what each source names**, whether or not the resolution used it. A source is `null` only when it was not read: `block` when the body contains no block or a malformed one, `commits` when the commits cannot be read, and `pr_title` when the title does not invert. Within a record, a field that the source does not determine is `null`, `breaking` included.

- `block` mirrors the block as read: its `title`, its `overrides`, which lists only the keys that are set, its `entries`, each with `type`, `scopes`, `breaking`, `text`, and any `migration`, and its `entries_commit`. `entries` is empty when the block records none and when they were malformed; `entries_commit` is `null` when the block records none.
- `commits` is the record to which the commits between `--base` and `--head` consolidate. Every field is `null` when the range contains no entry.
- `labels` is the record that the labels name, and is never `null`. `type` and `scope` each resolve when exactly one label of their section names a key. `breaking` is `true` with the `breaking` label, `false` when a type label resolves without it, and `null` otherwise.
- `pr_title` is the record that the pull-request title contains: the bare `title` and the `ticket_ref`, and the `scope`, `type`, and `breaking` of any typed prefix, each `null` when the title contains no prefix. It is read under `--override-title` too.

**The bare title** comes from `--override-title`, then from the pull-request title inverted through `pr.title_format`, then from the block's title, then from the pull-request title as given. A scope and type read from the pull-request title, through `pr.title_format` when it names `{type}` and otherwise through `commit.title_format`, never stay in the bare title. `ticket_ref` comes from the pull-request title, then from `--ticket-ref`. `merge_title` is `effective_record` rendered through `merge.title_format`, the marker included, or the bare title when that template is empty.

**`body` is the merge body**: the `## What` section, without any `change-record` block and without the trailing lines that contain only a closing keyword (`close`, `fix`, `resolve`, and their inflections) and ticket references.

**`merge_block` is the block's change entries in the [merge-commit form](./change-record.md#the-merge-commit-form)**, fences included, with `pr_number` from `--pr-number` as an integer and `ticket_ref` from `effective_record`, left out when that is `null`. The entries keep the order in which the block records them. **`entry_count`** is the number of entries that `merge_block` records.

The entries render whether or not they are fresh: a merge re-derives nothing, and a `stale-entries` notice reports staleness instead. `merge_block` is `null`, and `entry_count` is `0`, when the block is absent, malformed, or records no entry. `merge_block` is separate from `body`, so a consumer that replaces a thin body keeps it.

**`defects` block approval.** Each names a condition that the author must settle before the merge is offered, with the kinds that [`resolve-effective-record`](#resolve-effective-record) lists. The block's change entries are checked first, fresh or stale, since the merge block publishes them either way: Each entry whose type `work-types.json` does not declare, or whose marker breaks its type's `breakingPolicy`, yields an `undeclared-type` or `policy-violation` whose `entry` names the entry's 0-based index, in entry order. The effective record's defect follows, without `entry`. An entry defect is settled by [`amend-entry`](#amend-entry), since an override changes only the effective record; the record's defect is settled by an override.

```json
[
  { "entry": 1, "kind": "undeclared-type", "type": "feature" },
  { "kind": "missing-type" }
]
```

**The block's entries decide the record.** `resolve-merge` ranks them into a scope, type, and marker by the rule that [`consolidate-entries`](#consolidate-entries) applies, and that record stands whether or not the entries are fresh. The entries are fresh when the block records some, records the commit at which they were derived, and the head that `--head` names starts with that commit, compared case-insensitively: The block records a short SHA and the pull request reports a full one. Stale entries raise `stale-entries`. A block that records no entries, or whose entries are malformed, resolves its base record from the labels and the commits as a body without a block does, and its overrides still apply.

**`notices` inform the gate** and block nothing:

| Kind                  | Meaning                                                                                                                                                                                                                                       |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `absent-block`        | The body contains no block, so the merge publishes no change entries. `effective_sources` names what supplied each field in the block's place. The `add-change-record` skill adds a block to a body that has none.                            |
| `malformed-block`     | The body's last block cannot be read; `defect` names why, and the merge resolves as though no block were present.                                                                                                                             |
| `commits-unavailable` | The commits cannot be read; `reason` names why, and without entries to rank, the record resolves from the labels alone.                                                                                                                       |
| `pr-title-divergence` | The pull-request title's typed prefix differs from `effective_record`; `fields` lists the fields on which they differ. It is raised under `--override-title` too.                                                                             |
| `pr-title-unparsed`   | The pull-request title does not invert through `pr.title_format`; `effective_sources.title` names what stands in.                                                                                                                             |
| `malformed-entries`   | The block's `entries` list cannot be read; `defect` names why. The entries are reported as absent, the base record resolves from the labels and the commits, and the block's title and overrides stay in use.                                 |
| `stale-entries`       | The block records entries that were not derived at the pull request's head. `entries_commit` names the commit at which they were derived, `null` when the block records none, and `head_commit` names the head against which it was compared. |

**Each override outranks every source on its own field**, as [The effective record](./change-record.md#the-effective-record) states; `--no-override-breaking` removes the marker. `--override-title` replaces the bare title, and the pull-request title's prefix is still read and compared.

**A head commit that the local repository lacks is not an error.** The run reports `commits-unavailable` and resolves from the block or the labels alone, so fetch the head commit before resolving. Any other git failure stops the run.

The run refuses if no taxonomy is readable and if the body file cannot be read. With an empty `commit.title_format`, the run reports `commits-unavailable` rather than refusing. `--override-type` refuses a type spelled with `!`, and the run refuses `--override-breaking` together with `--no-override-breaking`.

## `check-merge-body`

`check-merge-body` reads a composed merge body back as release-kit reads the merge commit, and refuses a body that would not yield the expected entries.

```bash
node {harness_home_dir}/scripts/describe-change.mjs check-merge-body \
  --body-file {body_file} \
  --entry-count 2
```

Both flags are required. `--body-file` names a file containing the whole merge body, and `--entry-count` takes the `entry_count` that [`resolve-merge`](#resolve-merge) reported, as a non-negative integer.

```json
{ "entry_count": 2 }
```

The body's last `change-record` block is read under the rules of the [merge-commit form](./change-record.md#the-merge-commit-form): Any defect makes the whole block malformed. The run exits non-zero, naming the defect or both counts, when the file cannot be read, when the block is malformed, and when the number of entries that it records differs from `--entry-count`. A body containing no block records none, so it passes only with `--entry-count 0`, and a body containing a block fails with `--entry-count 0`.

## `amend-entry`

`amend-entry` rewrites one change entry in the last `change-record` block of a pull-request body file, and writes the body back to the same file.

```bash
node {harness_home_dir}/scripts/describe-change.mjs amend-entry \
  --body-file {body_file} \
  --entry 1 \
  --type feat \
  --no-breaking
```

`--body-file` and `--entry` are required. `--entry` takes the entry's 0-based index, as a defect's `entry` names it. `--type` sets the entry's type, and `--breaking` or `--no-breaking` sets its marker; at least one of the three is required, and a field that the invocation leaves out keeps the entry's value.

```json
{
  "entry": { "breaking": false, "scopes": ["agents"], "text": "Adds the parser", "type": "feat" },
  "entry_count": 2
}
```

The run re-renders the whole block as [`render-block`](#render-block) renders one, keeping its `title`, `overrides`, and `entries_commit` and dropping any key that the grammar does not declare. The block's formatting is normalized, so the body's diff shows the whole block changing. Text outside the block is unchanged byte for byte, and the block takes the line ending of the body around it.

The run exits non-zero, naming the cause and leaving the file untouched, when the body contains no block or a malformed one, when the block's entries are malformed, when `--entry` is out of range, when `--type` is spelled with `!` (pass `--breaking`), when the taxonomy does not declare the amended type, and when the amended marker breaks the type's `breakingPolicy`. An amendment that succeeds therefore clears the entry's defect. It also refuses `--breaking` together with `--no-breaking`, a file that cannot be read or written, and a taxonomy that cannot be read.

## `resolve-scopes`

`resolve-scopes` reports the scope that owns each given path, so a consumer can attribute a set of changed files to the workspaces that own them. `--path` is its one flag, repeatable and optional.

```bash
node {harness_home_dir}/scripts/describe-change.mjs resolve-scopes \
  --path packages/kb/src/index.ts --path AGENTS.md
```

```json
{ "path_scopes": { "packages/kb/src/index.ts": "kb", "AGENTS.md": "root" }, "scopes": ["kb", "root"] }
```

**`path_scopes` maps each path as given to its scope**, under the spelling that the invocation passed, so a caller can look a result up by the path that it asked about. **`scopes` is the sorted set** of the scopes that those paths name between them.

**The derivation**: `@williamthorsen/nmr/workspace` resolves the repository root's workspace directories, honoring the `packages` patterns that `pnpm-workspace.yaml` declares, negative patterns included. A path's scope is the basename of the longest of those directories that contains it, so a nested workspace wins over the one enclosing it. A path that no workspace directory contains resolves to `root`.

**A repository declaring no workspaces yields `root` for every path.** A root that is not a pnpm workspace, and one whose patterns match no directory, both discover none, and this is how a consumer detects that the repository has no scope vocabulary. A repository on another package manager reads the same way.

**A path is read relative to the repository root**, which git resolves from the invoking directory, so an absolute path and a root-relative one resolve alike whatever subdirectory the caller ran from. A path outside the root resolves to `root`. When git resolves no repository root, the run warns and anchors at the invoking directory.

**The subcommand defines no rule of its own.** It delegates discovery to `@williamthorsen/nmr/workspace`, whose resolver reads the same `pnpm-workspace.yaml` patterns that release-kit reads to name the workspaces it builds changelogs under. The resolver is bundled into the deployed script, which therefore needs nothing installed in the repository that it runs in. `scope-labels.unit.test.ts` in `packages/agents` holds the derived vocabulary to the `scope:` labels that `.config/release-kit.config.ts` declares. A change to the discovery rule belongs upstream, in nmr.

## `resolve-labels`

`resolve-labels` reports the labels for a change, from the entries in the body file's last `change-record` block and from the effective record that the flags pass. `--body-file` is required, and `--scope`, `--type`, and `--breaking` are optional.

```bash
node {harness_home_dir}/scripts/describe-change.mjs resolve-labels \
  --body-file {change_summary_path} \
  --scope agents --type feat
```

```json
{ "labels": ["feature", "fix", "breaking", "scope:agents", "scope:kb"] }
```

**`labels` is the union of what the record and the entries name**, each mapped through the repository's `.meta/label-map.json`: the type label of every type, `breaking` when the record or any entry is breaking, and the scope label of every scope. Type labels come first, then `breaking`, then scope labels. Within each group the record's label leads, followed by the entries' labels in the order in which the entries name them, and each label appears once.

**A key that the map does not name, and a scope of `*`, add no label.** The run reads no taxonomy, so an undeclared type is labeled only when the map names it. A label map that is absent, unparseable, or empty yields no labels at all, `breaking` included.

**The body file may be the change summary itself**, since only its last `change-record` block is read and the frontmatter is ignored. A body containing no block, or a block without entries, is labeled from the flags alone. The run warns and does the same for a malformed block or entry list, and it refuses a body file that cannot be read. `--type feat!` is accepted and splits into the bare type and the marker.

## Supported tokens

| Token          | Resolves to                                                                                                            |
| -------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `{scope}`      | Change scope (workspace, package, module), one name or several joined by commas. `*` normalizes to empty.              |
| `{type}`       | Work type (`feat`, `fix`, `docs`, …). Renders as `feat!` when the template names no `{breaking}` to render the marker. |
| `{breaking}`   | The breaking marker `!`; empty for a change that is not breaking.                                                      |
| `{title}`      | Bare title text. Required in every template that should produce a non-empty title.                                     |
| `{ticket_ref}` | Rendered ticket reference (`#466`, `MAC-147`, …); empty when no ticket is associated.                                  |
| `{pr_number}`  | PR number; empty when not yet known. Only meaningful in `merge.title_format`.                                          |

A template that omits `{title}` produces a title without the bare title text: The renderer does not insert it implicitly. Any other `{...}` run is literal text, so a typo such as `{titel}` shows up in the rendered output rather than vanishing.

## Optional groups

A `[...]` group renders verbatim when every token directly inside it resolves non-empty. When one is empty, the whole group drops, literals included.

A group containing both `{scope}` and `{type}` therefore drops the type along with an absent scope, and a `*` scope is absent by the time the group decides. When the type should stay in the title of a change with no scope, nest the scope in a group of its own, as the piped-scope convention does.

`{breaking}` never decides a group. A non-breaking change would otherwise drop the very prefix that contains the marker.

Groups nest, and a nested group is kept or dropped on its own. Under `[[{scope}|]{type}: ]{title}`, a change naming no scope keeps its type prefix and renders `feat: Add foo`, while a change naming neither scope nor type renders the bare title.

Write `\[` and `\]` for a literal bracket, and `\\` for a literal backslash.

**No whitespace pass runs.** Output is exactly what the template describes, so each group contains its own separators: Write `[{ticket_ref} ]{title}`, not `[{ticket_ref}] {title}`. That exactness lets `parse-title` invert what the renderer produced.

## The catalogue

Four conventions, each of which round-trips.

| Convention           | Template                                  |
| -------------------- | ----------------------------------------- |
| Bracketed scope      | `[\[{scope}\] ]{type}{breaking}: {title}` |
| Conventional commits | `{type}[({scope})]{breaking}: {title}`    |
| Piped scope          | `[[{scope}\|]{type}: ]{title}`            |
| Type only            | `{type}{breaking}: {title}`               |

Piped scope places the marker on the type, since it names no `{breaking}`; the other three place the marker immediately before the colon. Piped scope also nests its scope group inside its type group, so a change naming no scope keeps its type prefix.

How they render across the cases that separate them:

| Record                                | Bracketed scope                         | Conventional commits                   | Piped scope                            | Type only                      |
| ------------------------------------- | --------------------------------------- | -------------------------------------- | -------------------------------------- | ------------------------------ |
| scope `agents`, type `feat`           | `[agents] feat: Add foo`                | `feat(agents): Add foo`                | `agents\|feat: Add foo`                | `feat: Add foo`                |
| type `feat`, no scope                 | `feat: Add foo`                         | `feat: Add foo`                        | `feat: Add foo`                        | `feat: Add foo`                |
| scope `agents`, type `drop`, breaking | `[agents] drop!: Remove the legacy API` | `drop(agents)!: Remove the legacy API` | `agents\|drop!: Remove the legacy API` | `drop!: Remove the legacy API` |
| title only                            | `: Add foo`                             | `: Add foo`                            | `Add foo`                              | `: Add foo`                    |

Because three of the four name `{type}` outside any group, a record with no type renders a subject opening with a bare colon. Supply a type, or choose piped scope, whose type is inside a group and drops with it.

## Constraints from release-kit

Because release-kit reads merge subjects to build the changelog, a template whose subjects it must read is bound by what its parser accepts:

- Any ticket reference comes first, in one of the three stripped forms above.
- A pipe separates the scope from the type (`agents|feat:`), or parentheses follow it (`feat(agents):`). The parser reads no bracketed scope, so `[agents] feat: Add foo` is unmatched.
- The breaking marker is immediately before the colon: `feat!:`, `feat(agents)!:`.
- Because the type is a run of word characters, a type with a hyphen or a dot goes unread. The parser lowercases the type before matching the taxonomy. Case does not decide the match, and the canonical spelling stays lowercase.

## What the grammar refuses

The bundle checks each configured template when preferences load, and a template that cannot round-trip stops the run, naming the surface, the template, and the defect. It refuses four structural defects:

- **Adjacent tokens.** Two tokens with no literal between them, such as `{scope}{type}`, leave a parse no boundary to split on. `{breaking}` beside another token is exempt, since the marker is a single known character.
- **A repeated token.** A token named twice leaves a parse no way to decide which occurrence a value belongs to.
- **A group boundary that repeats.** An optional group whose opening literal repeats the text before it hides where the group begins.
- **An indistinguishable marker.** `{breaking}` placed beside free text, or beside a literal that spells `!`, leaves the marker unrecognizable.

A render-and-parse pass over well-formed values then acts as a fallback for the four checks, so that it catches a defect that a later extension to the grammar introduces and the checks miss.

## What the grammar does not support

**Value-dependent ambiguity passes the check.** The check runs over well-formed values, so it accepts a template whose ambiguity depends on what a value happens to contain. Under `[{ticket_ref} ]{title}`, the title `#466 Add foo` reads back as ticket reference `#466` and title `Add foo`. Because that matches how release-kit reads it, the behavior is compatibility rather than a defect, but a caller that keeps both halves separately should not rely on a round trip to recover them.

The same cost applies to the piped-scope convention, in which a present group wins. `Rename kb|docs: the shared layer` reads back as scope `Rename kb`, type `docs`, title `the shared layer`. The type check prevents the misreading when the type is nonsense, so `Support a|b: syntax` is unmatched, but not when the type is real.

## Scope values

The `{scope}` token expects a value that identifies the part of the codebase affected. Surface-defined values:

- In a monorepo, the scope is typically the workspace name or abbreviation.
- Use `root` when the change touches only files at the monorepo root.
- Use `*` when the change spans multiple workspaces, or root and one or more workspaces. It normalizes to no scope, so the rendered title has no scope prefix.

**A scope may name several workspaces, joined by commas**, which is how one commit entry that spans two workspaces renders as one `Change:` trailer: `agents,kb|feat: Add the store-qualified wikilink`. Normalization trims each name and drops the empty ones, the `*` ones, and the duplicates, keeping first-occurrence order; `agents,*` therefore names `agents`, and a value that leaves nothing behind names no scope, exactly as a whole-value `*` does.

A rendered list reads back as the same value, since the scope run is bounded by the delimiter that the template itself places after it and no catalogued convention delimits the scope with a comma. A template that does is refused as one that cannot round-trip.

**Consolidation counts each named workspace separately.** One entry naming `agents,kb` contributes both, exactly as two entries naming one apiece do, so it consolidates to no scope.

Per-surface guidance on when to apply each value (e.g., what to count as `root` for a commit) is stated by the consuming skill; see the `consult-commit-conventions` skill for the commit-side rules.
