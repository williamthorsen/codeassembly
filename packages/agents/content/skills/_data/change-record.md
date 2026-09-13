# The change record

A change's scope, type, and breaking marker are consolidated once from the branch's commits, and then carried to every surface that needs them. This file defines the terms, states the two grammars that carry them (the `Change:` commit trailer, and the fenced `change-record` block a pull-request body ends with), states how overrides apply, and states how a merge reads the block back.

[`title-templates.md`](./title-templates.md) states the commands that consolidate, resolve, and render. This file states what they produce and how it is written down.

## Terms

| Term                | Meaning                                                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| record              | The values from which a title renders: `title`, `scope`, `type`, `breaking`, `ticket_ref`, and `pr_number`.                                                        |
| entry               | The record that one commit subject or one `Change:` trailer declares.                                                                                              |
| consolidated record | The `scope`, `type`, and `breaking` to which a branch's entries consolidate.                                                                                       |
| overrides           | The `scope`, `type`, and `breaking` that the author sets by hand, plus `title` at merge.                                                                           |
| effective record    | The consolidated record, or at merge the record resolved from the sources, with the overrides applied, plus the title and, at merge, `ticket_ref` and `pr_number`. |
| block               | The fenced `change-record` block that ends a pull-request body. It is never called "the record".                                                                   |

## The record's fields

| Field        | Meaning                                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------------------------- |
| `breaking`   | Whether the change breaks consumers.                                                                                |
| `pr_number`  | The pull request's number, which only a merge knows.                                                                |
| `scope`      | The workspace the change belongs to. A consolidated record names none when the branch's entries name more than one. |
| `ticket_ref` | The reference to the ticket that the change serves.                                                                 |
| `title`      | The change's title, without any rendered prefix.                                                                    |
| `type`       | A work type declared in [`work-types.json`](./work-types.json).                                                     |

In the block and in the change summary's frontmatter, a field that is not determined is absent rather than empty, and `breaking` appears only as `true`. In JSON output, a field that nothing determines is `null`. The `*` scope normalizes to no scope and never reaches a consolidated record.

## The `Change:` trailer

A commit that stands for several entries records each one as a `Change:` trailer, rendered through `commit.title_format`. The trailer and the subject it stands for are therefore the same grammar, and either reads back through the same template.

```
agents|fix: Condense the branch

Change: agents|feat: Add the parser
Change: agents|fix: Correct the guard
```

`condense-branch` writes one per entry when it squashes a branch, so a condensed branch stays readable. Git parses them as trailers, so the block may sit below any number of body paragraphs.

**A commit carrying trailers contributes them in place of its subject.** Its subject renders the record to which those trailers already consolidate, so reading both would count the branch against itself.

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
```
````

| Key                   | Meaning                                                                                                                             |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `title`               | The change summary's title. Required.                                                                                               |
| `consolidated_record` | The consolidated record's `scope`, `type`, and `breaking`. Absent when the branch determined none of them.                          |
| `overrides`           | The `scope`, `type`, or `breaking` that the author set by hand. Absent when the author set none. `breaking` appears only as `true`. |

The payload is YAML rather than a surface template because `consolidated_record` and `overrides` nest, and a template renders one flat line. Nesting also leaves room for the block to gain structured keys, such as a grammar version or a ticket reference. Its inverse is a YAML parse rather than a compiled pattern, so this pair needs none of the round-trip verification the title grammar requires.

**The block carries no entry list.** A reader at merge time needs the consolidated record; the per-entry list lives in the change summary's `changes` frontmatter field, where a reader who wants it has the whole summary to hand.

**The block is the body's last element.** A reader takes the last `change-record` fence in the body, and a body composed from the change summary excludes the block itself.

## The effective record

The overrides apply to the consolidated record one field at a time, and a field that no override names keeps the consolidated record's value:

- A `scope` override replaces the scope. A scope override of `*` is recorded as given, and it leaves the effective record with no scope.
- A `type` override replaces the type and keeps the breaking marker.
- A `breaking` override sets the marker in the direction it names. A block or a change summary records the override only as `true`, so there it can add the marker but never remove it. A merge's breaking override can also remove it.

An override is kept as the author set it, even if it equals the consolidated record. The consolidated record is re-derived whenever the branch moves, and the override has to outlast that.

The `resolve-effective-record` subcommand of `describe-change.mjs` applies this rule to a change summary's fields and reports the effective record; see [`resolve-effective-record`](./title-templates.md#resolve-effective-record). `resolve-merge` and `capture-lede-decision` apply the same rule.

## Where the record is written

| Surface                    | What it carries                                                                                                       |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Change-summary frontmatter | `title`, the consolidated record's `scope`, `type`, and `breaking`, `changes`, `ticket_type`, and the override fields |
| Condensed commit message   | A subject rendered from the consolidated record, and one `Change:` trailer per entry                                  |
| Pull-request body          | `Closes`, then the block as the final block                                                                           |
| Pull-request labels        | The effective record's type and scope, mapped through `.meta/label-map.json`, plus `breaking` where it is breaking    |

[Artifact conventions](./artifact-conventions.md#change-summary-frontmatter) specifies the change-summary fields.

## Where the record is read

`merge-pr` reads the block when it merges, through the `resolve-merge` subcommand of `describe-change.mjs` (see [`resolve-merge`](./title-templates.md#resolve-merge)), and compares it with a record consolidated afresh from the commits up to the pull request's head commit. The run reports what each source names and attributes each field of the effective record to the source that supplied it, under the names that [`resolve-merge`](./title-templates.md#resolve-merge) lists.

**The body's last `change-record` block is the one read.** It is malformed where it never closes, where its payload is not a YAML mapping, where `title` is missing, empty, or not a string, where `consolidated_record` or `overrides` is not a mapping, and where a declared field has the wrong type. A malformed block is reported as `malformed-block` and resolved as though it were absent. A key that the grammar does not declare is ignored, and a declared key whose value is null reads as absent.

**With a readable block**, the block's consolidated record and the record consolidated from the commits are compared on scope, type, and breaking, before any override:

- If they agree, or if the commits cannot be read, the block's stands.
- If they disagree, the commits' wins as the fresher of the two, and a `divergence` notice names the fields on which the two differ. The block's consolidated record therefore decides a merge only when the commits could not be read, as on a fork whose head commit cannot be fetched.

The comparison is of whole records, so every field is attributed to the one that stands, `block` or `commits`, including a field on which the other agrees. The block's overrides then apply to whichever stands, as [The effective record](#the-effective-record) states, and each field that they set is attributed to `block_overrides`.

**Without a readable block**, the labels stand in for the block. The type and its breaking marker come together, from the labels if exactly one type label resolves and otherwise from the commits, so a marker never pairs with a type from the other source. The scope comes from its label if exactly one resolves, and otherwise from the commits. The breaking label is the literal `breaking`. Each field is attributed to `labels` or `commits` according to where it came from, so a type from the labels and a scope from the commits are reported as such. Where the chosen record disagrees with the commits', a `divergence` notice names the fields on which the two differ.

**The merge's own overrides apply last** and outrank the block's, each on its own field, as [The effective record](#the-effective-record) states. Each field that they set is attributed to `flags`.

**The pull-request title is read whether or not the merge overrides the title.** Its prefix is compared with the effective record, and a `pr-title-divergence` notice names the fields on which they differ. A title that does not invert through `pr.title_format` raises `pr-title-unparsed`.

**The effective record must name a declared type and satisfy that type's breaking policy.** Otherwise the merge is not offered for approval until the author overrides it; nothing is normalized.
