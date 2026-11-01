# Findings triage helper

`src/triage-spike-findings/` contains the helper that the `triage-spike-findings` skill runs, bundled to `content/skills/triage-spike-findings/triage-spike-findings.mjs`. It checks that the repository has the graded label families, validates the skill's dispositions record against the gate, and renders the dispositions comment and the per-issue comments from that record. It does not write anything remote: The skill creates the tickets through `create-ticket` and posts the comments.

## Commands

Every command prints one JSON result to stdout. A result has `ok: true` and the command's fields, or `ok: false` with an `error` code and a `message`, in which case the command exits 1. A value-bearing flag accepts both `--flag value` and `--flag=value`.

```bash
triage-spike-findings.mjs check-labels [--root <dir>]
triage-spike-findings.mjs validate --file <dispositions.json>
triage-spike-findings.mjs render --file <dispositions.json> --out <dir> [--preview]
```

- **`check-labels`** runs `gh label list` in `--root` (the working directory by default) and reports `families`, one entry per family with its `present` and `missing` labels, and `complete`, which is true only when every label of both families is present. The families are `confidence:` (`high`, `medium`, `low`) and `value:` (`must-have`, `should-have`, `nice-to-have`, `questionable`), as the common preset of `release-kit sync-labels` spells them. A `gh` failure is `gh-failed`.
- **`validate`** parses the record at `--file` and applies the gate. The result contains `items`, the counts `byDisposition`, `byConfidence`, and `byValue`, `missingTickets`, and `order`. `missingTickets` contains the ids of the `ticket` items without a number and whether `umbrella` is null while a `ticket` item exists. `order` lists every item id in display order. The display order places every `ticket` item after the items that block it, and among the items whose blockers are placed, takes them by value (`must-have`, `should-have`, `nice-to-have`, `questionable`), then by confidence (`high`, `medium`), with record order breaking ties; each is followed by the `merge` items that target it. The `comment` and `drop` items follow, in record order. The skill creates the children in this order, so that every blocker has a number when the items that it blocks are created.
- **`render`** validates the record, then writes `dispositions-comment.md` and one `comment-{issue}.md` per issue that a `comment` disposition names under `--out`, grouping the items that name one issue into one file. The result contains `preview`, `dispositionsComment`, and `issueComments`, a list of `{ issue, path }`. Without `--preview`, a `ticket` item without a number or a null `umbrella` on a record that has a `ticket` item is `tickets-missing`, and nothing is written; with it, `(pending)` stands in for each missing number.

The error codes are `gate-violation`, `gh-failed`, `invalid-args`, `invalid-record`, `record-not-found`, and `tickets-missing`. A `gate-violation` message names every failing item and clause.

## The record

```json
{
  "source": "spike #270",
  "triageTicket": 278,
  "umbrella": null,
  "commit": "0c30f1be9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b",
  "items": [
    {
      "id": "10",
      "title": "Header search ranking and descriptions",
      "disposition": "ticket",
      "confidence": "high",
      "value": "must-have",
      "reason": "The one cross-page path to a book cannot find a shared title.",
      "target": null,
      "ticket": null,
      "blockedBy": ["12", 415],
      "evidence": { "key": "src/search.ts:duplicated-ranking", "paths": ["src/search.ts"] },
      "challenge": { "argument": "...", "outcome": "defended", "note": "..." }
    }
  ],
  "challengeSummary": "...",
  "notes": []
}
```

`disposition` is `ticket`, `comment`, `merge`, or `drop`. `target` is the issue number for a `comment`, the id of a `ticket` item for a `merge`, and null otherwise. `ticket` is the created child's number, null until the skill creates it; `umbrella` likewise. `blockedBy`, optional and on a `ticket` item alone, lists its blockers: the ids of other `ticket` items, and the numbers of issues outside the triage. `evidence`, optional, states what the item is about, so that a later run can recognize the same subject: `key` is a stable identifier copied from the findings and matched as an exact string, and `paths` lists the files that it covers, at least one. `commit`, optional, is the full 40-character SHA of the HEAD at which the dispositions were approved. `challenge.outcome` is `defended`, `modified`, or `abandoned`. `notes` contains the lines of the comment's "Labels and follow-ups" section, which is omitted when the list is empty.

## The gate

A record passes when every clause holds, and `validate` and `render` report every violation of a failing record:

- A `low` item does not take a ticket.
- A `merge` names the id of a `ticket` item.
- A `comment` names an issue number.
- A `ticket` or `drop` item does not have a target.
- Only a `ticket` item has a ticket number or blockers.
- A blocker id names another `ticket` item, and an item does not list any blocker twice.
- The blockers do not form a cycle; a cycle is reported once, with its ids in order.
- An item has evidence only when the record has a commit.
- Every id is declared once.

## The rendered comment

`dispositions-comment.md` opens with a heading naming the source, a paragraph stating the grading convention and, when an item takes a ticket, the umbrella, and a table with the columns item, disposition, confidence, value, where, blocked by, and reason, whose rows follow the display order that `validate` reports. The where column is `#N` for a `ticket` or `comment` item, `merged into {id}` for a `merge`, and empty for a `drop`. The blocked-by column lists a `ticket` item's blockers as `#N`, with `(pending)` for a blocker not yet created. A `## Challenge` section contains `challengeSummary`, and a `## Labels and follow-ups` section contains `notes`.

When any item has evidence, the comment ends with a hidden evidence block, an HTML comment that does not appear on the rendered page:

```
<!-- codeassembly:triage-evidence v1
{"version":1,"source":"spike #270","triageTicket":278,"commit":"<sha>","items":[{"id":"10","key":"src/search.ts:duplicated-ranking","paths":["src/search.ts"],"disposition":"ticket","where":282}]}
-->
```

The JSON contains the record's `source`, `triageTicket`, and `commit`, and one entry per item with evidence, in display order, whatever its disposition. `where` is the ticket number of a `ticket` item (null until it is created), the issue number of a `comment`, the target id of a `merge`, and null for a `drop`. Every `>` in the JSON is written as `\u003e`, so that a value cannot close the HTML comment. `parseEvidenceBlock` in `src/triage-spike-findings/evidence.ts` reads the block from a comment body, and returns `undefined` for a body without one, for another version, or for a malformed payload. A change that adds a field keeps version 1; a change that renames or removes one takes a new version.

`comment-{issue}.md` opens with one line naming the source and the triage ticket, then one bullet per item: its title, its grades, and its reason.
