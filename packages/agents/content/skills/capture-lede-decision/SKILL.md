---
name: capture-lede-decision
description: Record the author's decision about a merged pull request's lede — accepted as the agent wrote it, or revised — into the lede-decision corpus. Use after a merge, or to record a pull request merged outside the merge flow.
user-invocable: true
---

# Capture a lede decision

Record what the author decided about a lede: that the agent's `## What` shipped as written, or that it was rewritten before merge. A bundled helper does the mechanical work — it reads the lede the agent published and the lede that merged from the ticket's own artifacts, fingerprints the doctrine that governed the first, and writes one event record. You present the pair and relay the author's decision.

**Announce at start:** "Using capture-lede-decision to record the lede decision for #{pr}."

## The corpus stores positive signals only

A record exists because the author looked at the lede and decided. There are exactly two decisions, and no third:

- **`accepted`** — the author read the agent's lede and shipped it as written.
- **`revised`** — the author rewrote it before merge.

Declining to decide writes nothing. **The absence of a record carries no meaning, and in particular is not an acceptance**: a merge nobody evaluated is indistinguishable from a merge this skill never ran on. Never infer a verdict, and never record one the author did not give — a lede that shipped unchanged under time pressure is not an accepted lede, and recording it as one is the single failure that would make the corpus useless.

For the same reason, the corpus is outcome-selected: it holds only changes someone chose to evaluate. It is the right population for reading what good looks like and what typically fails, and the wrong one for measuring whether guidance helps. A comparison's fixture draw must never read it.

## Arguments

| Argument             | Description                                                                             | Required |
| -------------------- | --------------------------------------------------------------------------------------- | -------- |
| `--artifact-dir`     | The ticket's artifact directory, holding the pull-request and merge artifacts.          | Yes      |
| `--pr`               | The pull-request number.                                                                | Yes      |
| `--merge-commit`     | The merge commit's SHA.                                                                 | Yes      |
| `--inspect`          | Resolve and report the episode without writing. Mutually exclusive with `--verdict`.    | Mode     |
| `--verdict`          | The author's decision: `accepted` or `revised`. Mutually exclusive with `--inspect`.    | Mode     |
| `--store`            | Registry name of the event store, or `@default` for the `default_kb`. Needed to record. | Yes      |
| `--type`             | Work type. Falls back to the change summary's frontmatter.                              | No       |
| `--scope`            | Package or surface scope. Falls back to the change summary's frontmatter.               | No       |
| `--ticket`           | Ticket id. Falls back to the change summary's frontmatter.                              | No       |
| `--merged-lede-file` | File holding the merged lede, for a pull request that wrote no merge artifact.          | No       |
| `--agent-lede-file`  | File holding the agent's lede, for a pull request that wrote no pull-request artifact.  | No       |
| `--harness`          | The agent platform (`claude`, `rovodev`); install-injected — keep as-is.                | Injected |

Exactly one of `--inspect` and `--verdict` must appear. The author's comment is read from stdin to EOF; an empty comment is allowed and records no comment section.

## Runtime dependencies

- **`node` ≥ 24** — the bundled helper inherits the Node version floor of `@codeassembly/kb`.

## Process

### 1. Inspect the episode

```bash
node {harness_home_dir}/skills/capture-lede-decision/capture-lede-decision.mjs \
  --inspect \
  --artifact-dir <ticket artifact directory> \
  --pr <number> \
  --merge-commit <sha> \
  [--type <key>] [--scope <name>] [--ticket <id>]
```

The helper prints a JSON object to stdout: `ok: true` with `episode` on success, or `ok: false` with `error` and `message`. Inspecting writes nothing and needs no store, so it can never block or alter a merge that already happened.

On `ok: false`, report the `message` on one line and stop. The merge has already succeeded — do not present this as a merge failure, and do not retry.

### 2. Present the pair and ask

Read `episode.differ`. Present the ledes and ask, following [option format](#option-format):

When `differ` is `true`, show the agent's lede and the merged lede, then ask:

1. ■■□ Record it as a revision (add a comment to explain what was wrong, if you want)
2. ■□□ Skip — this was a content change, or not a decision worth recording

When `differ` is `false`, show the single lede and ask:

1. ■■□ Record it as accepted — you read it and shipped it as written
2. ■□□ Skip — you did not evaluate it

Ask once. A skip is a complete answer, not a prompt to re-ask or to persuade: the corpus is better off one record smaller than holding a decision the author did not make.

### 3. Record the decision

On a skip, write nothing and say nothing further.

On a decision, pipe the author's comment (empty when they gave none) to the helper:

```bash
cat <<'EOF' | node {harness_home_dir}/skills/capture-lede-decision/capture-lede-decision.mjs \
  --verdict <accepted|revised> \
  --store <name|@default> \
  --harness {harness_id} \
  --artifact-dir <ticket artifact directory> \
  --pr <number> \
  --merge-commit <sha> \
  [--type <key>] [--scope <name>] [--ticket <id>]
<the author's comment, verbatim; may be empty and may span multiple lines>
EOF
```

Relay the comment verbatim. It is free text on purpose: naming which doctrine rule the fix invoked is the refinement pass's job, and a rule list offered at capture time would presuppose which rules matter, which is the question the corpus exists to answer.

Report the written `path` on success.

## The record

One event per decision, in the named store:

- **Tags** — `lede-decision`, `type:{work type}`, and the verdict. Recall the corpus as a group with `kb-retrieve-events --tag lede-decision`, and by work type with `--tag type:feat`.
- **Frontmatter** — the work type, tier, and scope; the pull-request number, merge commit, and ticket; `doctrine-hash`, a digest of the lede doctrine in force when the agent wrote; and `agents-version` when the install manifest supplies one.
- **Body** — `## Agent lede`, then `## Merged lede` whenever the two texts differ, then `## Comment` when one was given.

`doctrine-hash` is what groups records by doctrine generation. Nothing is recorded at install time to make that work: the mapping from a digest back to the commit that introduced it stays recoverable by re-hashing the doctrine file's own history.

## Handling failures

Route by the `error` code:

- `no-artifact-dir`, `no-agent-lede`, `no-merged-lede` — the ticket's artifacts do not carry both ledes. Report and stop; supply `--agent-lede-file` or `--merged-lede-file` only when the text is genuinely in hand.
- `no-doctrine` — the installed doctrine file is unreadable. Report it as an install problem.
- `unresolved-identity` — the work type, tier, or scope could not be resolved. The message names which; pass the corresponding flag.
- `invalid-args` — surface the message and propose a corrected invocation.
- `missing-store`, `store-not-registered`, `readonly-store`, `no-default-store` — the destination could not be resolved; the message lists the registered stores.
- `schema-validation` — surface the `errors`.

## Completion

Either one written record at the reported path, or nothing at all. There is no third outcome, and no record is ever written without the author's decision.

<!-- include: ../_partials/option-format.md / -->
