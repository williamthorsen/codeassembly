---
name: merge-pr
description: Merge a pull request by composing a merge-commit message, validating PR state, and delegating to the platform's merge API
user-invocable: true
dependencies:
  skills:
    - emit-event
---

# Merge pull request

Merge a pull request on the appropriate platform. `describe-change.mjs` resolves the merge-commit title and body from the PR's `change-record` block, its commits, and its curated description; this skill presents what it resolves at an approval gate, then delegates the actual merge to a platform-specific skill (`merge-gh-pr` or `merge-bb-pr`).

## Optional arguments

| Flag                          | Effect                                                                                                                                                     | Default                   |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `--pr {n}`                    | Merge PR `{n}` instead of the PR for the current branch.                                                                                                   | PR for the current branch |
| `--scope {scope}`             | Override the scope. Outranks the PR's `change-record` block and every other source; `*` merges with no scope.                                              | resolved in step 3        |
| `--type {type}`               | Override the work type, spelled bare (`feat`, not `feat!`). Outranks the PR's `change-record` block and every other source, and keeps the resolved marker. | resolved in step 3        |
| `--breaking`, `--no-breaking` | Merge as breaking, or as not breaking. Outranks the PR's `change-record` block and every other source.                                                     | resolved in step 3        |
| `--strategy {s}`              | Override the merge strategy: `squash`, `merge`, or `rebase`.                                                                                               | `squash`                  |
| `--delete {v}`                | Override branch deletion: `both`, `remote`, or `none`. `both` is GitHub-only.                                                                              | `remote`                  |

## Reserved preference keys

`merge.strategy` and `merge.deletion_strategy` are **reserved keys** in `.agents/preferences.yaml` and `~/.agents/preferences.yaml`. They are not yet honored: This iteration uses the hard-coded defaults above. Setting them in preferences has no effect; CLI overrides are the only way to change the values today.

## Process

### 1. Get session context

Invoke `node {harness_home_dir}/skills/derive-session-context/derive-session-context.mjs` via Bash. The bundle emits the session-context manifest JSON to stdout; extract `ticket_ref`, `branch_name`, `default_branch`, `scm`, `project_slug`, `ticket_id`, `artifact_base_dir`, and `pr_url` from it. Then emit `skill.started` (payload `{"skill":"merge-pr"}`) per [Lifecycle events](#lifecycle-events).

### 2. Resolve the PR

Resolve the PR to merge per [PR source resolution](../_data/pr-source-resolution.md#runtime-resolution-path-add-change-record-review-pr-merge-pr): An explicit `--pr {n}` overrides; otherwise a stored `pr_url` from session context is the default; otherwise discover the PR for the current branch. Persist the resolved URL via `--set-pr-url`, and invalidate (`--clear-pr-url`) and re-resolve a stored URL that does not yield the expected PR.

Read the PR's metadata for the steps below, dispatching on `scm`:

- **`"github"`**:

  ```bash
  gh pr view {pr} --json number,title,body,labels,headRefName,headRefOid,baseRefName,isCrossRepository,url
  ```

- **`"bitbucket"`**: Issue an `action: "get"` call per [Bitbucket pull-request access](../_data/bitbucket-pr-access.md), then map its fields onto the same names that the steps below use: `description` to `body`, `source.branch.name` to `headRefName`, `source.commit.hash` to `headRefOid`, `destination.branch.name` to `baseRefName`, `links.html.href` to `url`, and an empty array to `labels`. `isCrossRepository` is true when `source.repository.full_name` names a repository other than the PR's own.
- **Unknown or missing**: Ask the user which platform to use, matching step 7's behavior.

If no PR can be resolved or discovered, emit `skill.completed` (payload `{"outcome":"stopped: no PR"}`) per [Lifecycle events](#lifecycle-events), then stop with: "No open PR found for branch `{branch_name}`. Create one with `{skill:create-pr}` first."

Capture `title` (PR title), `body` (PR body), `labels` (label objects), `number`, `headRefName` (head branch), `headRefOid` (head commit), `baseRefName` (base branch), and `isCrossRepository` from the response. The steps below use them.

Then fetch the PR's base branch and head, so that step 3 reads the PR's own commits whichever branch is checked out. `{remote}` is the remote that `default_branch` names (`origin` in `origin/main`):

```bash
git fetch {remote} {baseRefName} {headRefName}
```

For a GitHub PR whose `isCrossRepository` is true, fetch `pull/{number}/head` in place of `{headRefName}`. A Bitbucket fork's head cannot be fetched from `{remote}`, so fetch the base branch alone. A failed fetch does not stop the merge: Step 3 reports a head commit that it cannot read, and resolves without the commits.

### 3. Resolve the merge

`describe-change.mjs` resolves the effective record, the merge-commit title, and the body in one run, by the rules in [Where the record is read](../_data/change-record.md#where-the-record-is-read). This step runs it and resolves nothing by itself.

Write the PR body to a scratch file per [gh body file](#gh-body-file), naming it `gh-body-pr{number}-{timestamp}.md`. On GitHub, write it from the platform, so that the file contains the body byte for byte:

```bash
gh pr view {pr} --json body --jq '.body' > "{body_file}"
```

On Bitbucket, write the `description` from step 2 to the file verbatim.

Then run the helper, opening with the assignment and the guard:

```bash
body_path="{absolute path from the write step}"
[ -s "$body_path" ] || { echo "Body file missing or empty: $body_path" >&2; exit 1; }
node {harness_home_dir}/scripts/describe-change.mjs resolve-merge \
  --base "{remote}/{baseRefName}" \
  --head "{headRefOid}" \
  --pr-number "{number}" \
  --pr-title "{title}" \
  --pr-body-file "$body_path" \
  [--pr-label "{label_1}" --pr-label "{label_2}" ...] \
  [--ticket-ref "{ticket_ref}"] \
  [--override-scope "{scope}"] [--override-type "{type}"] [--override-breaking | --no-override-breaking] \
  [--override-title "{title}"]
```

The guard keeps a failed read out of the merge. The redirect above truncates the file before `gh` writes, so a failed read leaves it empty, and an empty body contains no `## What` and no `change-record` block: The helper would resolve the effective record from the labels alone, step 5 would dispatch the drafter, and the offer below would propose adding a block to a body that was never read. If the guard refuses, emit `skill.completed` (payload `{"outcome":"stopped: PR body not read"}`) per [Lifecycle events](#lifecycle-events) and stop.

Pass each PR label from step 2 as a separate `--pr-label` flag. Pass `--ticket-ref` only when `ticket_ref` from session context is non-null and `headRefName` is `branch_name`, since a PR merged from another branch's checkout belongs to another ticket; the helper uses that reference only when the PR title contains none. Pass this skill's `--scope`, `--type`, `--breaking`, and `--no-breaking` as `--override-scope`, `--override-type`, `--override-breaking`, and `--no-override-breaking`, omitting each one that was not given.

If this step's first run exits non-zero, or the helper is not found, emit `skill.completed` (payload `{"outcome":"stopped: merge not resolved"}`) per [Lifecycle events](#lifecycle-events) and stop with its message. No title or body is composed without it. Step 8's re-read stops the same way, since no answer is at fault there.

A re-run driven by an answer at step 6's gate does not stop the skill, and neither does a refused `amend-entry`. Report the helper's message and return to the question that produced the answer: The refusal is in the answer, and the resolution already in hand is still good. A type spelled with `!` is that case, which step 6 maps rather than passes through.

The helper prints one JSON object. Read it from the command's output, with python3 (or jq) when a parser helps:

- `effective_record`: the effective `title`, `scope`, `type`, `breaking`, `ticket_ref`, and `pr_number`.
- `effective_sources`: the source that supplied each field of `effective_record` apart from `pr_number`, such as `block`, `commits`, `labels`, `pr_title`, or `flags`.
- `merge_title`: the rendered merge-commit title, which includes the breaking marker.
- `body`: the PR's `## What` section, without the `change-record` block and without the `Closes` line.
- `merge_block`: the `change-record` block that the merge body contains below the lede, rendered from the PR block's change entries, or `null` when the PR block records none.
- `entry_count`: the number of change entries that `merge_block` records, `0` when it is `null`.
- `sources`: what the block, the commits, the labels, and the PR title each name, whether or not the resolution used them, each `null` if it was not read.
- `defects`: each condition that the author must settle before approval. A defect naming an `entry` is a change entry's, identified by its 0-based index, and settled by amending that entry; any other is `effective_record`'s, settled by an override.
- `notices`: what the gate shows beside the proposal.

[`resolve-merge`](../_data/title-templates.md#resolve-merge) states every field.

The overrides passed to this run are the merge's **override set**. Each later run of this step, for a choice at the gate or for step 8's re-read, passes the whole set with that run's addition, and the same `--head`.

**When the first run's `notices` contains `absent-block`, offer to add the block, if this checkout can draft it.** The pull request contains no change record, so the merge would publish no change entries. `{skill:add-change-record}` drafts the entries from `{default_branch}...HEAD`, and refuses when HEAD is not the pull request's head commit, so read the local head before offering:

```bash
git rev-parse HEAD
```

When it is not `headRefOid`, make no offer: This checkout describes other commits, and the merge of a pull request from another branch's checkout is a case that this skill supports. Carry the notice to the gate at step 6 and name the checkout there as the reason that no block can be drafted here.

When it is `headRefOid`, emit `input.requested` (payload `{"prompt":"add-change-record"}`) per [Lifecycle events](#lifecycle-events), then ask once, naming that consequence and saying that the offer runs `{skill:summarize-change}` to draft the entries:

```
PR #{number} contains no change record, so the merge would publish no change entries. Draft the entries and add the block? This runs `{skill:summarize-change}`. 👍🏼👎🏼
```

On yes, invoke `{skill:add-change-record}` with `--pr {number}`. Then write a fresh body file from the platform as this step does and run the helper again, with the same override set and the same `--head`. A failure there stops the skill as the first run does, since no answer is at fault.

On no, and when `{skill:add-change-record}` stopped for any of its own reasons, continue with the report that the first run produced. The gate at step 6 then reports the notice.

### 4. Resolve strategy and deletion strategy

```
resolveStrategy(cliOverride):          return cliOverride ?? 'squash'
resolveDeletionStrategy(cliOverride):  return cliOverride ?? 'remote'
```

`--delete both|remote|none` map directly to the same string values.

Refuse here when `scm` is `"bitbucket"` and the resolved deletion strategy is `both`, before step 6 asks for anything. Emit `skill.completed` (payload `{"outcome":"stopped: unsupported deletion strategy"}`) per [Lifecycle events](#lifecycle-events), then stop with:

<!-- include: ../_partials/bitbucket-delete-both-refusal.md / -->

### 5. Compose merge-commit body

The report's `body` is the merge-commit **lede** candidate. The published body is that lede followed by the report's `merge_block`, which the last part of this step composes.

A lede is **thin** if it is empty or contains fewer than 30 characters of non-whitespace content. The 30-character threshold is a default heuristic; proceed with a shorter lede if it is clearly intentional and self-contained (e.g., "Cosmetic only.", "Reverts #418.").

If the lede is thin, compose fresh content through the drafter that `summarize-change` dispatches, rather than writing it here. The drafter contains the lede doctrine.

Resolve the tier by looking up the report's `effective_record.type` in [work-types.json](../_data/work-types.json).

If `defects` contains an entry defect, settle every entry defect here as step 6 does, since an amended entry can change the effective record. Then, if `defects` shows that the effective record has no declared type (`missing-type`, or an `undeclared-type` that names no `entry`), ask step 6's type question here rather than composing against a guess, then re-run step 3 with the answer added to the override set and resolve the tier from the new report.

Dispatch the `{subagent:entry-drafter}` subagent via the {tool:Task} tool with this block:

```dispatch
type: {resolved type}
tier: {resolved tier}
ticket-source: {ticket URL or reference}
```

The block contains scalars only, and only these keys. Compose no prose into it: The drafter gathers every fact itself, and a sentence written here introduces this session's weighting into the draft. Read its `## Report` for any source that it could not access.

The lede is the drafter's `## Lede` section. The merge publishes the entries themselves in `merge_block`, so nothing here renders them.

**Compose the published body**: the lede, a blank line, and the report's `merge_block` verbatim.

```
{lede}

{merge_block}
```

Append `merge_block` to whichever lede is used, the drafted one included, since it comes from the PR's block rather than from the body. A report whose `merge_block` is `null` publishes the lede alone, with no blank line after it.

Do not audit the draft here: The user reads the published body at the approval gate in step 6, before anything is published.

<!-- include: ../_partials/nested-list-indent.md / -->

### 6. Approval gate

Settle every item in `defects` before showing the proposal, one question at a time. Settle the entry defects first, in entry order: Amending an entry can change the effective record, and with it the record's own defects.

**An entry defect** (one that names an `entry`) is settled by amending that entry in the PR body, because an override changes only the effective record, and the merge block would still publish the entry as it stands. Ask one question per entry defect. Quote the entry's `text` from `sources.block.entries`, and name its type for an `undeclared-type`, or the type and the policy that it breaks for a `policy-violation`. Offer the types that the test below assigns to the entry's own text, the marker that the policy asks for when the defect is a `policy-violation`, and an "other (specify)" option. State in the prompt that the answer rewrites that entry in the PR body.

On an answer, re-read the PR body into a fresh scratch file as step 3 writes one, named `gh-body-pr{number}-amend-{timestamp}.md`: from the platform on GitHub, and on Bitbucket from a fresh read of the description through step 2's platform dispatch. The question is human-paced, so the copy that step 3 read can be older than the PR, and writing it back would discard an edit made while the question was pending. Then amend the entry in that file, opening with the assignment and the guard. Pass `--type` for a type answer and `--breaking` or `--no-breaking` for a marker answer:

```bash
body_path="{absolute path from the re-read}"
[ -s "$body_path" ] || { echo "Body file missing or empty: $body_path" >&2; exit 1; }
node {harness_home_dir}/scripts/describe-change.mjs amend-entry \
  --body-file "$body_path" \
  --entry "{entry}" \
  [--type "{type}"] [--breaking | --no-breaking]
```

The helper rewrites the file in place and refuses an answer that would leave the entry defective. [`amend-entry`](../_data/title-templates.md#amend-entry) states its refusals. Then write the amended body to the PR:

- **`"github"`**: `gh pr edit {number} --body-file "$body_path"`, in a call that opens with the same assignment and guard.
- **`"bitbucket"`**: [Bitbucket pull-request access](../_data/bitbucket-pr-access.md) documents no description-write action. Emit `skill.completed` (payload `{"outcome":"stopped: no Bitbucket write path"}`) per [Lifecycle events](#lifecycle-events), then stop, showing the amended `change-record` block from the body file and saying that the author pastes it over the description's block in the Bitbucket UI, then runs the merge again.

Then re-run step 3 with the same override set and the same `--head`. Its fresh read of the body confirms that the amendment reached the PR.

**A defect of the effective record** is settled by an override:

- **`missing-type` or `undeclared-type`**: Ask for the type. Present a numbered list of the distinct types that the report's `sources` name (in the block's `entries` and `overrides`, and in `commits`, `labels`, and `pr_title`), plus the type that the test below assigns to the diff when no source names it, and an "other (specify)" option.
- **`policy-violation`**: Name the type and the policy that it breaks. Offer `--no-override-breaking` (which removes the forbidden marker), the types from the list above, and an "other (specify)" option.

Mark each type option by applying this test to the diff, not by how many sources name the type:

<!-- include: ../../_partials/work-type-choice.md / -->

Apply the test to the diff whether or not `defects` holds an item. Commits, labels, and a PR title that agree can agree on one wrong type, which raises no defect, and the merge title would then publish that type. When the test's type differs from the effective record's, raise that as a question here; when they agree, ask nothing and report nothing, here or at the gate.

Take an answer spelled with the marker as the pair that the flags imply: `feat!` is `--override-type feat` with `--override-breaking`, and for an entry, `--type feat` with `--breaking`. The helper refuses a type spelled with `!`, so it would refuse an answer passed through unchanged, and the defect would stay unsettled.

When asking option-style questions, follow [option format](#option-format). (Reinforces the rule in `AGENTS.md`: intentional redundancy.)

Re-run step 3 after each answer, with an override answer added to the override set, until `defects` is empty. Never offer the merge while `defects` contains an item. If an answer moves the effective record to another tier and step 5 drafted the body, re-run step 5's drafting against the new tier.

Emit `input.requested` (payload `{"prompt":"merge-approval"}`) per [Lifecycle events](#lifecycle-events), then render the proposed merge to the user:

```
Proposed merge for PR #{pr_number}:

  Title:    ▶︎ {merge_title} ◀︎
  Strategy: {strategy}
  Delete:   {deletion_strategy}

  ▼ Body
  {published body}
  ▲

{notices}

{confirmation}
```

`{published body}` is step 5's composed whole, the lede and its `change-record` block together. The triangle delimiters wrap the title and body, the parts that will actually be published, and a squash merge writes them to a protected default branch where they cannot be amended.

**Between the closing `▲` and `{confirmation}`, report only what is wrong.** A line belongs there only when it names a condition that blocks or complicates the merge: a notice, a failing or pending check, or a defect in the published body, such as a typo that the merge commit would publish verbatim. The user reads silence as a clean merge, so never report an absence: no line for an empty `defects` or `notices`, a mergeable state, passing checks, or sources that agree. An empty `{notices}` renders nothing, and a clean run shows the proposal followed directly by `{confirmation}`. No line restates a value that the triangles already show, such as the scope, type, or breaking marker in the title.

Render each notice there as one line. When a line says where a field came from, name the source that `effective_sources` gives for that field:

- **`absent-block`**: The PR contains no `change-record` block, so the merge publishes no change entries, and the effective record comes from the sources that `effective_sources` names field by field.
- **`malformed-block`**: The PR's `change-record` block cannot be read (its `defect`), so the labels and the commits resolved the effective record.
- **`commits-unavailable`**: The commits were not read (its `reason`), so when the block records no entries, the effective record comes from the labels alone.
- **`pr-title-divergence`**: The PR title's prefix differs from the proposal on the fields that the notice's `fields` lists. Name the prefix's values for those fields, read from `sources.pr_title`.
- **`pr-title-unparsed`**: The PR title did not parse, so the title comes from the source that `effective_sources.title` names.
- **`malformed-entries`**: The block's entry list cannot be read (its `defect`), so the block records no entries, and the labels and the commits resolved the base record. Its title and overrides still stand.
- **`stale-entries`**: The block's entries were derived at the commit that the notice's `entries_commit` names, `null` when the block records none, and not at the head that its `head_commit` names, so commits pushed since then may not be described by the entries, whose record still stands.

**A `stale-entries` notice is reported and nothing is re-derived.**

A `pr-title-divergence` notice names values that the user can merge under instead, and the title is theirs to replace. If the user answers the gate with such values or a new title rather than a clear approval or decline, add them to the override set (a scope as `--override-scope`, `*` for no scope, a type as `--override-type`, a marker as `--override-breaking` or `--no-override-breaking`, and a title as `--override-title`), re-run step 3, settle any new defect, and render this gate again.

Render `{confirmation}` so that the ask itself names every destructive side effect that the approval authorizes. The permission auto-classifier grants only what the ask text names, so a branch deletion shown only in the `Delete:` line above is not authorized; the ask must name it too:

- `none` → `Merge PR #{pr_number}? 👍🏼👎🏼`
- `remote` → `Merge PR #{pr_number} and delete the remote branch {headRefName}? 👍🏼👎🏼`
- `both` → `Merge PR #{pr_number} and delete the local and remote branch {headRefName}? 👍🏼👎🏼`

Under a `stale-entries` notice, open the ask with `The change record is stale. ` so that the approval names what it accepts: `The change record is stale. Merge PR #{pr_number}? 👍🏼👎🏼`. Under an `absent-block` notice, open it with `The pull request contains no change record. ` in the same way.

If the user declines, emit `skill.completed` (payload `{"outcome":"stopped: declined"}`) per [Lifecycle events](#lifecycle-events), then stop with no API call and no artifact. If they approve, continue.

<!-- include: ../_partials/action-items.md / -->

### 7. Detect platform and select delegate

Read `scm` from session context:

- `"github"` → delegate to `{skill:merge-gh-pr}`
- `"bitbucket"` → delegate to `{skill?:merge-bb-pr}`
- Unknown or missing → ask the user which platform to use

### 8. Re-read the PR and re-confirm a changed title or body

This step exists because a published merge-commit title and body cannot be amended on a protected default branch under a squash merge. The approval gate is human-paced, so an edit made to the PR while it is pending would otherwise be discarded and the merge would publish the pre-gate text irrecoverably. Do not fold this read back into step 2: A single pre-gate read leaves that window open.

Re-read the PR's `title` and `description` (or `body` on GitHub) using step 2's platform dispatch, then re-run step 3 over them: a fresh body file, the new title, the `headRefOid` read in step 2, and the override set as settled at the approval gate. Then compare the two values that the merge publishes:

- **Title**: Compare the new `merge_title` with the approved one.
- **Lede**: Compare the new report's `body` with the `body` of the report behind the body that the user most recently approved. If it changed, re-run step 5 over it in full, the thin-lede fallback included, so that a description that has since gained a real `## What` is picked up. Advance the baseline with each approval, as for the title; if it stayed at the pre-gate report, every pass would re-run the fallback and the loop would never converge.
- **Merge block**: Compare the new report's `merge_block` with the approved report's, as strings. If it changed and the lede did not, recompose the published body from the approved lede and the new `merge_block`, dispatching no drafter, since the lede is unaffected.

If neither the lede nor the merge block changed, keep the approved body.

If the new report contains a defect, return to step 6 and settle it before comparing.

The lede comparison keys on the report's `body` rather than on the composed lede because step 5's thin-lede fallback composes fresh prose, which does not reproduce word for word from one run to the next. Comparing composed output would report a change on every pass, and the loop below would have no fixed point to reach. The helper's extraction is deterministic, so it has one. Keying on the `## What` section rather than on the whole description also means an edit confined to another section raises nothing, which is correct: Nothing outside `## What` appears in the merge commit.

The merge block takes a comparison of its own because `body` excludes the `change-record` block: An edit confined to that block leaves `body` identical while changing what the merge publishes, and `merge_title` catches only the subset of such edits that move the record ranked from the entries. `merge_block` is rendered by the helper rather than drafted, so comparing it has the fixed point that the lede comparison needs `body` to supply.

The window that this step closes is an edit to the PR's title or description. New commits pushed to the branch are not in scope: The re-run reads the commits up to the head commit read in step 2, and a generated body is not recomposed on account of later commits. The delegate's own branch-sync check reports local and remote divergence.

If every re-read value matches the approved one, continue to step 9 without saying anything. If any differs, re-render step 6's gate with the new values and ask again, and repeat this step after each approval until the values stop changing. Merging the newest version silently would publish text that the user never approved, which is the same defect from the other direction. If the user declines, emit `skill.completed` (payload `{"outcome":"stopped: declined"}`) per [Lifecycle events](#lifecycle-events) and stop with no merge and no artifact, exactly as step 6 does.

### 9. Check the published body

The merge commit is the record from which release-kit reads the change entries, and it rejects a whole block on any defect, so read the approved body back before publishing it. Write the published body to a scratch file per [gh body file](#gh-body-file), naming it `gh-body-pr{pr_number}-check-{timestamp}.md`, then run the helper with the approved report's `entry_count`, opening with the assignment and the guard:

```bash
body_path="{absolute path from the write step}"
[ -s "$body_path" ] || { echo "Body file missing or empty: $body_path" >&2; exit 1; }
node {harness_home_dir}/scripts/describe-change.mjs check-merge-body \
  --body-file "$body_path" \
  --entry-count "{entry_count}"
```

The helper refuses a body whose block is malformed, or whose entry count differs from `--entry-count`. A count of `0` requires the body to contain no block. [`check-merge-body`](../_data/title-templates.md#check-merge-body) states the rules.

If it exits non-zero, emit `skill.completed` (payload `{"outcome":"stopped: merge body failed round-trip"}`) per [Lifecycle events](#lifecycle-events) and stop with its message. Nothing is merged.

### 10. Call delegate

Pass the following inputs to the selected delegate per the delegate interface:

| Input               | Value                                                                |
| ------------------- | -------------------------------------------------------------------- |
| `pr_number`         | Resolved PR number                                                   |
| `title`             | Rendered `merge_title` as step 8 last resolved and the user approved |
| `body`              | Published body as step 8 last resolved and the user approved         |
| `strategy`          | Resolved strategy from step 4                                        |
| `deletion_strategy` | Resolved value from step 4 (`both` \| `remote` \| `none`)            |
| `ticket_id`         | From session context                                                 |
| `project_slug`      | From session context                                                 |
| `artifact_base_dir` | From session context                                                 |

The orchestrator never passes a title that `defects` blocks, or a `prompt` sentinel, to the delegate: All values are concrete by this point.

If the delegate stopped or failed, emit `skill.completed` (payload `{"outcome":"stopped: <reason>"}`) per [Lifecycle events](#lifecycle-events) and stop. Otherwise capture one thing from the delegate's completion report and continue: whether it reported a merge. Step 11 reports the outcome from it.

### 11. Report the outcome

Emit `skill.completed` per [Lifecycle events](#lifecycle-events): payload `{"outcome":"merged"}` when the delegate reported a merge, and `{"outcome":"not merged"}` when it did not. A merge whose commit SHA is unavailable is still a merge, and is reported as `merged`.

Report nothing else here, and invoke nothing. The merge flow records no lede decision and makes no offer to record one; a capture is the author's own request, made whenever they choose.

## Important

- The orchestrator owns every decision that it presents (PR resolution, strategy and deletion strategy, body composition, the approval gate), and `describe-change.mjs` owns the resolution of the effective record, the merge title, and the body. Delegates own only execution (platform API calls + state validation).
- Local state is intentionally untouched after the merge. The delegate deletes the branch on the remote per the resolved decision; the local working copy and current branch are not modified. The default `remote` mode deletes the remote branch via a post-merge `gh api -X DELETE` call (delegated to `merge-gh-pr`); `both` mode passes `--delete-branch` to `gh pr merge`, which is incompatible with worktree-based workflows: `gh pr merge --delete-branch` fails when the base branch is checked out in another worktree. On Bitbucket, `both` has no counterpart at all and `merge-bb-pr` refuses it, naming `--delete remote` as the alternative.
- Never bypass branch protections. The orchestrator does not expose `--admin`; users who need that capability run `gh pr merge --admin` directly.
- Never list automated checks (formatting, linting, typechecking, unit tests) in the merge body. They run automatically in CI.

<!-- include: ../_partials/gh-body-file.md / -->

<!-- include: ../_partials/option-format.md / -->

<!-- include: ../_partials/lifecycle-events.md / -->
