# The change record

A change's classification is derived once, from the branch's commits, and then carried to every surface that needs it. This file states what the record holds and the two grammars that carry it: the `Change:` commit trailer, and the fenced `change-record` block a pull-request body ends with.

[`title-templates.md`](./title-templates.md) states how the classification is derived and what the deriving command reports. This file states how the result is written down.

## The record

| Field      | Meaning                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------ |
| `breaking` | Whether the change breaks consumers. Absent means `false`; there is no explicit `false`.   |
| `scope`    | The workspace the change belongs to. Absent where the branch's entries name more than one. |
| `title`    | The change's title, without any rendered prefix.                                           |
| `type`     | A work type declared in [`work-types.json`](./work-types.json).                            |

A field the branch did not determine is absent rather than empty. The `*` scope normalizes to no scope and never reaches a written record.

## The `Change:` trailer

A commit that stands for several entries records each one as a `Change:` trailer, rendered through `commit.title_format`. The trailer and the subject it stands for are therefore the same grammar, and either reads back through the same template.

```
agents|fix: Condense the branch

Change: agents|feat: Add the parser
Change: agents|fix: Correct the guard
```

`condense-branch` writes one per entry when it squashes a branch, so a condensed branch stays readable. Git parses them as trailers, so the block may sit below any number of body paragraphs.

**A commit carrying trailers contributes them in place of its subject.** Its subject is the head those trailers already consolidate to, so reading both would count the branch against itself.

## The `change-record` block

A pull-request body carrying the record ends with a fenced block naming `change-record` as its info string. The payload is YAML, and the `--record-block` mode of `describe-change.mjs` renders it; see [Rendering the record block](./title-templates.md#rendering-the-record-block).

````markdown
```change-record
commit: e5029924
head:
  scope: agents
  type: feat
  title: Add the parser
overrides:
  type: sec
  breaking: true
```
````

| Key         | Meaning                                                                                                                              |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `commit`    | The commit from which the head was derived. A reader compares it with the pull request's head to spot drift.                         |
| `head`      | The record above, holding what the branch consolidated to plus the change summary's title.                                           |
| `overrides` | The `scope`, `type`, or `breaking` that the author set by hand. Absent where the author set none. `breaking` appears only as `true`. |

The payload is YAML rather than a surface template because `head` and `overrides` nest, and a template renders one flat line. Its inverse is a YAML parse rather than a compiled pattern, so this pair needs none of the round-trip verification the title grammar requires.

**The block carries no entry list.** A reader at merge time needs the head; the per-entry list lives in the change summary's `changes` frontmatter field, where a reader who wants it has the whole summary to hand.

**The block is the body's last element.** A reader takes the last `change-record` fence in the body, and a body composed from the change summary excludes the block itself.

## The effective record

A surface that renders a title or applies labels reads the head with the overrides applied: `scope` and `type` from the override where one is set, otherwise from the head, and `breaking` where either the head or the override sets it. An override can therefore add the breaking marker but never remove it.

An override is kept as the author set it, even where it equals the head. The head is re-derived whenever the branch moves, and the override has to outlast that.

## Where the record is written

| Surface                    | What it carries                                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Change-summary frontmatter | `title`, the head's `scope`, `type`, and `breaking`, `changes`, `ticket_type`, and the override fields             |
| Condensed commit message   | A subject rendered from the head, and one `Change:` trailer per entry                                              |
| Pull-request body          | `Closes`, then the `change-record` block as the final block                                                        |
| Pull-request labels        | The effective record's type and scope, mapped through `.meta/label-map.json`, plus `breaking` where it is breaking |

[Artifact conventions](./artifact-conventions.md#change-summary-frontmatter) specifies the change-summary fields.
