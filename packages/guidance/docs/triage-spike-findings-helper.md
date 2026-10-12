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
- **`validate`** parses the record at `--file` and applies the gate. The result contains `items`, the counts `byDisposition`, `byConfidence`, and `byValue`, and `missingTickets`: the ids of the `ticket` items without a number and whether `umbrella` is null.
- **`render`** validates the record, then writes `dispositions-comment.md` and one `comment-{issue}.md` per issue that a `comment` disposition names under `--out`, grouping the items that name one issue into one file. The result contains `preview`, `dispositionsComment`, and `issueComments`, a list of `{ issue, path }`. Without `--preview`, a `ticket` item without a number or a null `umbrella` is `tickets-missing`, and nothing is written; with it, `(pending)` stands in for each missing number.

The error codes are `gate-violation`, `gh-failed`, `invalid-args`, `invalid-record`, `record-not-found`, and `tickets-missing`. A `gate-violation` message names every failing item and clause.

## The record

```json
{
  "source": "spike #270",
  "triageTicket": 278,
  "umbrella": null,
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
      "challenge": { "argument": "...", "outcome": "defended", "note": "..." }
    }
  ],
  "challengeSummary": "...",
  "notes": []
}
```

`disposition` is `ticket`, `comment`, `merge`, or `drop`. `target` is the issue number for a `comment`, the id of a `ticket` item for a `merge`, and null otherwise. `ticket` is the created child's number, null until the skill creates it; `umbrella` likewise. `challenge.outcome` is `defended`, `modified`, or `abandoned`. `notes` holds the lines of the comment's "Labels and follow-ups" section, which is omitted when the list is empty.

## The gate

A record passes when every clause holds, and `validate` and `render` report every violation of a failing record:

- A `low` item does not take a ticket.
- A `merge` names the id of a `ticket` item.
- A `comment` names an issue number.
- A `ticket` or `drop` item has no target.
- Only a `ticket` item carries a ticket number.
- Every id is declared once.

## The rendered comment

`dispositions-comment.md` opens with a heading naming the source, a paragraph stating the grading convention and the umbrella, and a table with the columns item, disposition, confidence, value, where, and reason. The where column is `#N` for a `ticket` or `comment` item, `merged into {id}` for a `merge`, and empty for a `drop`. A `## Challenge` section carries `challengeSummary`, and a `## Labels and follow-ups` section carries `notes`.

`comment-{issue}.md` opens with one line naming the source and the triage ticket, then one bullet per item: its title, its grades, and its reason.
