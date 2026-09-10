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

`condense-branch` writes these when it squashes a branch, so a condensed branch stays readable. Git parses them as trailers, so the block may sit below any number of body paragraphs.

**A commit carrying trailers contributes them in place of its subject.** Its subject is the head those trailers already consolidate to, so reading both would count the branch against itself.

## The `change-record` block

A pull-request body ends with a fenced block naming `change-record` as its info string. The payload is YAML.

````markdown
```change-record
commit: e5029924
head:
  scope: agents
  type: feat
  title: Add the parser
overrides:
  type: feat
```
````

| Key         | Meaning                                                                                                |
| ----------- | ------------------------------------------------------------------------------------------------------ |
| `commit`    | The commit the head was derived from. A reader compares it with the pull request's head to spot drift. |
| `head`      | The record above, holding what the branch consolidated to plus the change summary's title.             |
| `overrides` | The `scope` or `type` the author set by hand. Absent where the author set neither.                     |

The payload is YAML rather than a surface template because `head` and `overrides` nest, and a template renders one flat line. Its inverse is a YAML parse rather than a compiled pattern, so this pair needs none of the round-trip verification the title grammar requires.

**The block carries no entry list.** A reader at merge time needs the head; the per-entry list lives in the change summary's `changes` frontmatter field, where a reader who wants it has the whole summary to hand.

**The block is the body's last element.** A reader takes the last `change-record` fence in the body, and a body composed from the change summary excludes the block itself.

## Where the record is written

| Surface                    | What it carries                                                                   |
| -------------------------- | --------------------------------------------------------------------------------- |
| Change-summary frontmatter | `title`, `scope`, `type`, `breaking`, `changes`, `ticket_type`                    |
| Condensed commit message   | One `Change:` trailer per entry                                                   |
| Pull-request body          | The `change-record` block, as the final block, alongside `Closes`                 |
| Pull-request labels        | The head's type and scope, mapped through `.meta/label-map.json`, plus `breaking` |

The change-summary fields are specified in [artifact conventions](./artifact-conventions.md#change-summary-frontmatter).
