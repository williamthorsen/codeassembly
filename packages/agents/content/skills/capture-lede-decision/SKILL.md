---
name: capture-lede-decision
description: Record the author's rating of a merged pull request's lede into the lede-decision corpus. Use after a merge, or to record a pull request merged outside the merge flow.
user-invocable: true
---

# Capture a lede decision

Record how good the lede that shipped is. A bundled helper does the mechanical work: It reads the lede the agent published and the lede that merged from the ticket's own artifacts, fingerprints the doctrine that applied to the first, and writes one event record. You present what shipped and relay the author's rating.

Every lede decision belongs to one corpus, the `codeassembly` event store, whichever repository the pull request merged in. The helper targets it without being told, so a caller never chooses a destination.

**Announce at start:** "Using capture-lede-decision to record the lede decision for #{pr}."

## What the rating grades

The rating grades the lede that shipped, whichever hand wrote it: the merged lede where the author rewrote it before merge, and the agent's lede where it shipped as written. It is one of five levels, lowest to highest:

`poor`, `adequate`, `good`, `strong`, `exemplary`

The middle of the scale is what the corpus most needs and most easily loses: a lede good enough that editing it is not worth the time, and not good enough that the author wants their imprimatur on it. Record such a lede at the level it deserves rather than rounding it up.

The verdict, `accepted` or `revised`, is not asked. The helper derives it from whether the two ledes differ and records it beside the rating.

## The corpus stores positive signals only

A record exists because the author looked at the lede and rated it. Declining to rate writes nothing. **The absence of a record means nothing, and in particular is not an endorsement**: A merge nobody evaluated is indistinguishable from a merge this skill never ran on. Never infer a rating, and never record one the author did not give: A lede that shipped unchanged under time pressure is not a rated lede, and recording a rating the author did not make is the single failure that would make the corpus useless.

For the same reason, the corpus is outcome-selected: It contains only changes someone chose to evaluate. It is the right population for reading what good looks like and what typically fails, and the wrong one for measuring whether guidance helps. A comparison's fixture draw must never read it.

## Arguments

| Argument             | Description                                                                               | Required |
| -------------------- | ----------------------------------------------------------------------------------------- | -------- |
| `--artifact-dir`     | The ticket's artifact directory, containing the pull-request and merge artifacts.         | Yes      |
| `--pr`               | The pull-request number.                                                                  | Yes      |
| `--merge-commit`     | The merge commit's SHA.                                                                   | Yes      |
| `--inspect`          | Resolve and report the episode without writing. Mutually exclusive with `--quality`.      | Mode     |
| `--quality`          | The author's rating of the lede that shipped. Mutually exclusive with `--inspect`.        | Mode     |
| `--store`            | Names a corpus registered under some other name; `@default` is refused.                   | No       |
| `--type`             | Work type. Falls back to the change summary's frontmatter.                                | No       |
| `--scope`            | Package or surface scope. Falls back to the change summary's frontmatter.                 | No       |
| `--ticket`           | Ticket id. Falls back to the change summary's frontmatter.                                | No       |
| `--merged-lede-file` | File containing the merged lede, for a pull request that wrote no merge artifact.         | No       |
| `--agent-lede-file`  | File containing the agent's lede, for a pull request that wrote no pull-request artifact. | No       |
| `--harness`          | The agent platform (`claude`, `rovo`); install-injected. Keep as-is.                      | Injected |

Exactly one of `--inspect` and `--quality` must appear. The author's comment is read from stdin to EOF; an empty comment is allowed and records no comment section.

## Runtime dependencies

- **`node` ≥ 24**: The bundled helper inherits the Node version floor of `@williamthorsen/kb`.
- **A `kb.yaml` registering the `codeassembly` store**: the corpus every lede decision is written to. Where no registry declares it, the skill says so and records nothing, rather than filing the decision somewhere else.

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

The helper prints a JSON object to stdout: `ok: true` with `episode` and `store` on success, or `ok: false` with `error` and `message`. Inspecting writes nothing, so it can never block or alter a merge that already happened.

On `ok: false`, report the `message` on one line and stop. The merge has already succeeded; do not present this as a merge failure, and do not retry.

On `store.reachable: false`, report `store.message` on one line and stop here, before presenting anything. The skill cannot reach the corpus, so it can record no decision; asking for one would spend the author's attention on an answer this skill would then discard.

### 2. Present what shipped and ask

Read `episode.differ`. Where it is `true`, show the agent's lede and the merged lede; where it is `false`, show the single lede. Then ask for a rating of the lede that shipped, adding a comment if the author wants to say what was wrong:

1. `poor`
2. `adequate`
3. `good`
4. `strong`
5. `exemplary`
6. Skip (you did not evaluate it, or this was a content change)

Ask once. A skip is a complete answer, not a prompt to re-ask or to persuade: The corpus is better off one record smaller than storing a rating the author did not make.

### 3. Record the decision

On a skip, write nothing and say nothing further.

On a rating, pipe the author's comment (empty when they gave none) to the helper:

```bash
cat <<'EOF' | node {harness_home_dir}/skills/capture-lede-decision/capture-lede-decision.mjs \
  --quality <poor|adequate|good|strong|exemplary> \
  --harness {harness_id} \
  --artifact-dir <ticket artifact directory> \
  --pr <number> \
  --merge-commit <sha> \
  [--type <key>] [--scope <name>] [--ticket <id>]
<the author's comment, verbatim; may be empty and may span multiple lines>
EOF
```

Relay the comment verbatim. It is free text on purpose: Naming which doctrine rule the fix invoked is the refinement pass's job, and a rule list offered at capture time would presuppose which rules matter, which is the question the corpus exists to answer.

Report the written `path` on success.

### Recording a pull request merged outside the merge flow

Such a pull request wrote no merge artifact, so the caller supplies the merged lede. The helper reads a lede file whole and records it as the lede, applying none of the heading extraction it uses on the artifact path: Where the file contains the entire pull-request body, the helper records the entire body as the lede. Extract the `## What` section as the file is written:

```bash
gh pr view <number> --json body --jq '.body' \
  | awk '{ sub(/\r$/, "") }
         tolower($0) ~ /^## what[[:space:]]*$/ { capturing = 1; next }
         /^## / { capturing = 0 }
         capturing' \
  > "$TMPDIR/merged-lede.md"
```

Pass that file to `--merged-lede-file` and continue from step 2. Everything else resolves from the ticket's artifacts as usual.

## The record

One event per decision, in the corpus:

- **Tags**: `lede-decision`, `type:{work type}`, the derived verdict, and `quality:{level}`. Recall the corpus as a group with `kb-retrieve-events --tag lede-decision`, by work type with `--tag type:feat`, and by rating with `--tag quality:exemplary`.
- **Frontmatter**: the rating; the work type, tier, and scope; the pull-request number, merge commit, and ticket; `doctrine-hash`, a digest of the lede doctrine in force when the agent wrote; and `agents-version` when the home-provenance stamp supplies one.
- **Body**: `## Agent lede`, then `## Merged lede` whenever the two texts differ, then `## Comment` when one was given.

`doctrine-hash` is what groups records by doctrine generation. Nothing is recorded at install time to make that work: The mapping from a digest back to the commit that introduced it stays recoverable by re-hashing the doctrine file's own history.

## Handling failures

Route by the `error` code:

- `no-artifact-dir`, `no-agent-lede`, `no-merged-lede`: The ticket's artifacts do not contain both ledes. Report and stop; supply `--agent-lede-file` or `--merged-lede-file` only when the text is genuinely in hand.
- `no-doctrine`: The installed doctrine file is unreadable. Report it as an install problem.
- `unresolved-identity`: The work type, tier, or scope could not be resolved. The message names which; pass the corresponding flag.
- `invalid-args`: Report the message and propose a corrected invocation.
- `store-not-registered`: The corpus is registered in no `kb.yaml`. Where it is registered under some other name, re-run with `--store <name>`.
- `readonly-store`: The corpus is registered readonly. Report and stop; the skill substitutes no other destination for one the registry protects.
- `schema-validation`: Report the `errors`.

## Completion

Either one written record at the reported path, or nothing at all. There is no third outcome, and no record is ever written without the author's rating.

<!-- include: ../_partials/option-format.md / -->
