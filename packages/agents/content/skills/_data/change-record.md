# The change record

A change's scope, type, and breaking marker are consolidated once from the change entries, and then written to every surface that needs them. This file defines the terms, states the two grammars that encode them (the `Change:` commit trailer, and the fenced `change-record` block that ends a pull-request body and, in its merge-commit form, a merge commit), states how overrides apply, and states how a merge reads the block back.

[`title-templates.md`](./title-templates.md) states the commands that consolidate, resolve, and render. This file states what they produce and how it is written down.

## Terms

| Term                | Meaning                                                                                                                                                                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| record              | The values from which a title renders: `title`, `scope`, `type`, `breaking`, `ticket_ref`, and `pr_number`.                                                                                                                                 |
| commit entry        | The record that one commit subject or one `Change:` trailer declares. `consolidate-branch` reports these.                                                                                                                                   |
| change entry        | One outcome of a change: its `type`, the `scopes` that it touched, its `breaking` marker, the sentence of `text` that reports it, and an optional one-line `migration` naming the edit that a consumer makes. `entry-drafter` writes these. |
| consolidated record | The `scope`, `type`, and `breaking` to which a list of entries consolidates, by one ranking that serves both kinds.                                                                                                                         |
| overrides           | The `scope`, `type`, and `breaking` that the author sets by hand, plus `title` at merge.                                                                                                                                                    |
| effective record    | The consolidated record, or at merge the record resolved from the sources, with the overrides applied, plus the title and, at merge, `ticket_ref` and `pr_number`.                                                                          |
| block               | The fenced `change-record` block that ends a pull-request body. A merge commit contains its merge-commit form. It is never called "the record".                                                                                             |

## The record's fields

| Field        | Meaning                                                                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `breaking`   | Whether the change breaks consumers.                                                                                                  |
| `pr_number`  | The pull request's number, which only a merge knows.                                                                                  |
| `scope`      | The workspace to which the change belongs. A consolidated record names none when the entries consolidated into it name more than one. |
| `ticket_ref` | The reference to the ticket that the change serves.                                                                                   |
| `title`      | The change's title, without any rendered prefix.                                                                                      |
| `type`       | A work type declared in [`work-types.json`](./work-types.json).                                                                       |

In the block and in the change summary's frontmatter, a field that is not determined is absent rather than empty, and `breaking` appears only as `true`. In JSON output, a field that nothing determines is `null`. The `*` scope normalizes to no scope and never appears in a consolidated record.

## The `Change:` trailer

A commit that stands for several commit entries records each one as a `Change:` trailer, rendered through `commit.title_format`. The trailer and the subject for which it stands are therefore the same grammar, and either reads back through the same template.

```
agents|fix: Condense the branch

Change: agents|feat: Add the parser
Change: agents|fix: Correct the guard
```

`condense-branch` writes one per commit entry when it squashes a branch, so a condensed branch stays readable. Because Git parses them as trailers, they may follow any number of body paragraphs.

**A commit with trailers contributes them in place of its subject.** Its subject renders the record to which those trailers already consolidate. Reading both would count the branch's commit entries twice.

## The `change-record` block

A pull-request body ends with a fenced block naming `change-record` as its info string. The payload is YAML, and the `render-block` subcommand of `describe-change.mjs` renders it; see [`render-block`](./title-templates.md#render-block).

````markdown
```change-record
title: Add the parser
consolidated_record:
  scope: agents
  type: feat
overrides:
  type: sec
  breaking: true
entries_commit: e5029924
entries:
  - type: feat
    scopes: [agents, kb]
    text: Adds the store-qualified wikilink `[[store:Note title]]`, which `kb check` resolves against the named store.
  - type: drop
    scopes: [kb]
    breaking: true
    text: Removes the `kb find` alias of `kb search`.
    migration: Replace `kb find` with `kb search`, which exits nonzero when nothing matches.
```
````

| Key                   | Meaning                                                                                                                                                                                                                    |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `title`               | The change summary's title. Required.                                                                                                                                                                                      |
| `consolidated_record` | The consolidated record's `scope`, `type`, and `breaking`. Absent when the change determined none of them.                                                                                                                 |
| `overrides`           | The `scope`, `type`, or `breaking` that the author set by hand. Absent when the author set none. `breaking` appears only as `true`.                                                                                        |
| `entries_commit`      | The short SHA of the commit at which the change entries were derived. Absent when the block records no entries.                                                                                                            |
| `entries`             | The change entries, in the order that the drafter returned them. Absent when there is none. Each renders `type`, `scopes` in flow form, `breaking` only when it is `true`, `text`, and `migration` when the entry has one. |

The payload is YAML rather than a surface template because `consolidated_record`, `overrides`, and `entries` nest, and a template renders one flat line. Nesting also leaves room for the block to gain structured keys, such as a grammar version or a ticket reference. Its inverse is a YAML parse rather than a compiled pattern, so this pair needs none of the round-trip verification required by the title grammar.

**The scalars precede `entries`**, so the bulky list does not separate the title from the consolidated record.

**The block carries the change entries as data**, which is how a reader downstream of the merge gets them without parsing them back out of the rendered `## Details` prose. The change summary's `changes` frontmatter field is a different list: It holds the commit entries, which record what the branch's commits declared.

**The block is the body's last element.** A reader takes the last `change-record` fence in the body, and the merge body that `resolve-merge` composes from the pull request excludes every block.

## The merge-commit form

A squash merge publishes the block's change entries below the lede, in a reduced form of the block that release-kit reads from the merge commit. `resolve-merge` renders it and reports it in `merge_block`, separate from the merge body; see [`resolve-merge`](./title-templates.md#resolve-merge).

````markdown
```change-record
pr_number: 470
ticket_ref: "#466"
entries:
  - type: feat
    scopes: [agents, kb]
    text: Adds the store-qualified wikilink `[[store:Note title]]`, which `kb check` resolves against the named store.
  - type: drop
    scopes: [kb]
    breaking: true
    text: Removes the `kb find` alias of `kb search`.
    migration: Replace `kb find` with `kb search`, which exits nonzero when nothing matches.
```
````

| Key          | Meaning                                                                                                    |
| ------------ | ---------------------------------------------------------------------------------------------------------- |
| `pr_number`  | The pull request's number, as a YAML integer.                                                              |
| `ticket_ref` | The effective record's ticket reference. Absent when the merge has none.                                   |
| `entries`    | The change entries that the pull request's block records, in its order, each rendered as it renders there. |

`title`, `consolidated_record`, `overrides`, and `entries_commit` are left out: The merge title already renders the effective record, and the rest served only to resolve it.

**A merge with no change entry writes no block**, since a block without entries tells release-kit nothing. That is the case when the pull request's block is absent, is malformed, or records no entry, and the merge body is then the lede alone.

**The form is read under release-kit's rules**, which are stricter than the pull-request form's: Any defect makes the whole block malformed, no entry is salvaged from a defective list, and `pr_number` must be a positive integer. Before merging, `merge-pr` reads the approved body back through the `check-merge-body` subcommand and refuses to merge when the block is malformed or records a different number of entries than `resolve-merge` rendered; see [`check-merge-body`](./title-templates.md#check-merge-body).

## The effective record

The overrides apply to the consolidated record one field at a time, and a field that no override names keeps the consolidated record's value:

- A `scope` override replaces the scope. A scope override of `*` is recorded as given, and it leaves the effective record with no scope.
- A `type` override replaces the type and keeps the breaking marker.
- A `breaking` override sets the marker in the direction that it names. A block or a change summary records the override only as `true`, so there it can add the marker but never remove it. A merge's breaking override can also remove it.

An override is kept as the author set it, even if it equals the consolidated record. The consolidated record is re-derived whenever the branch moves, and the override has to outlast that.

The `resolve-effective-record` subcommand of `describe-change.mjs` applies this rule to a change summary's fields and reports the effective record; see [`resolve-effective-record`](./title-templates.md#resolve-effective-record). `resolve-merge` and `capture-lede-decision` apply the same rule.

## Where the record is written

| Surface                    | What it contains                                                                                                      |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Change-summary frontmatter | `title`, the consolidated record's `scope`, `type`, and `breaking`, `changes`, `ticket_type`, and the override fields |
| Condensed commit message   | A subject rendered from the consolidated record, and one `Change:` trailer per commit entry                           |
| Merge commit               | The lede, then the merge-commit form of the block when the pull request's block records a change entry                |
| Pull-request body          | `Closes`, then the block as the final block, carried from the change summary's body                                   |
| Pull-request labels        | The effective record's type and scope, mapped through `.meta/label-map.json`, plus `breaking` when it is breaking     |

[Artifact conventions](./artifact-conventions.md#change-summary-frontmatter) specifies the change-summary fields.

## Where the record is read

`merge-pr` reads the block when it merges, through the `resolve-merge` subcommand of `describe-change.mjs` (see [`resolve-merge`](./title-templates.md#resolve-merge)), and compares it with a record consolidated afresh from the commits up to the pull request's head commit. The run reports what each source names and attributes each field of the effective record to the source that supplied it, under the names that [`resolve-merge`](./title-templates.md#resolve-merge) lists.

**The body's last `change-record` block is the one read.** It is malformed when it never closes, when its payload is not a YAML mapping, when `title` is missing, empty, or not a string, when `consolidated_record` or `overrides` is not a mapping, and when a declared field has the wrong type. A malformed block is reported as `malformed-block` and resolved as though it were absent. A key that the grammar does not declare is ignored, and a declared key whose value is null reads as absent.

**A defective `entries` list is the one exception to that rule.** The list is defective when it is not a list, when an item is not a mapping, when an item's `type` or `text` is missing, blank, or not a string, when its `breaking` is not a boolean, when its `scopes` is not a list of strings, or when its `migration` is not a string or spans more than one line; a non-string `entries_commit` reads the same way, since the commit records a claim about the entries. The block reads with its entries absent, its defect reported as `malformed-entries`, and its title and consolidated record still in use. Every other field keeps the all-or-nothing rule, because a block that loses either of those has nothing left to resolve from.

**The block's entries are fresh** when the block records some, records the commit at which they were derived, and the pull request's head starts with that commit. The comparison is a prefix test rather than an equality, since the block records a short SHA and the pull request reports a full one, and it ignores case. Entries recorded without a derivation commit are stale, since nothing establishes when they were read. A block whose entries are present and not fresh raises `stale-entries`, which names the derivation commit, `null` when the block records none, and the head against which it was compared.

**With a readable block**, the block's consolidated record and the record consolidated from the commits are compared on scope, type, and breaking, before any override. Four cases, and one predicate decides them:

- **The block's entries are fresh.** The block's record stands. It was consolidated from the change entries, whose scopes come from the paths that each entry touched, which the commit subjects only approximate.
- **The two agree, or the commits cannot be read.** The block's record stands, as on a fork whose head commit cannot be fetched.
- **The block's entries are stale or absent, or the block was written before they entered the grammar.** The commits' record wins as the fresher of the two consolidations.
- **The two disagree.** A `divergence` notice names the fields on which they differ, whichever of the two stands. Which one stood is read from `effective_sources`, not from the notice, whose `sources` tuple names the pair rather than the winner.

The comparison is of whole records, so every field is attributed to the one that stands, `block` or `commits`, including a field on which the other agrees.

The block's overrides then apply to whichever stands, as [The effective record](#the-effective-record) states, and each field that they set is attributed to `block_overrides`.

**A merge does not re-derive the block's entries.** Commits pushed after the body was composed are already out of scope at merge, so staleness is reported and the merge proceeds. A body that carries no block may gain one through `add-change-record` before the merge resolves; a block that is already written is never replaced, whether it reads, is malformed, or records no entry.

**Without a readable block**, the labels stand in for the block. A body that contains no block raises `absent-block`, so a gate can report that the entries are missing rather than empty; a block that cannot be read raises `malformed-block` instead. The type and its breaking marker come together, from the labels if exactly one type label resolves and otherwise from the commits. A marker never pairs with a type from the other source. The scope comes from its label if exactly one resolves, and otherwise from the commits. The breaking label is the literal `breaking`. Each field is attributed to `labels` or `commits` according to its source, so a type from the labels and a scope from the commits are reported as such. When the chosen record disagrees with the commits', a `divergence` notice names the fields on which the two differ.

**The merge's own overrides apply last** and outrank the block's, each on its own field, as [The effective record](#the-effective-record) states. Each field that they set is attributed to `flags`.

**The pull-request title is read whether or not the merge overrides the title.** Its prefix is compared with the effective record, and a `pr-title-divergence` notice names the fields on which they differ. A title that does not invert through `pr.title_format` raises `pr-title-unparsed`.

**The effective record must name a declared type and satisfy that type's breaking policy.** Otherwise the merge is not offered for approval until the author overrides it; nothing is normalized.
