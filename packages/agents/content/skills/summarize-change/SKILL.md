---
name: summarize-change
description: Analyze changes and generate structured summary for PR preparation
user-invocable: true
---

# Summarize change

Analyze the current branch's changes since diverging from the default branch.

The branch's classification is derived from its commits and recorded per [the change record](../_data/change-record.md).

## Arguments

| Flag              | Effect                                                                         |
| ----------------- | ------------------------------------------------------------------------------ |
| `--scope {scope}` | Overrides the derived scope.                                                   |
| `--type {type}`   | Overrides the derived work type. A `!` on it (`feat!`) adds the breaking mark. |

Both are optional, and each is recorded as an override beside the derived head rather than in place of it.

## Process

1. **Gather context**:
   - Invoke `node {harness_home_dir}/skills/derive-session-context/derive-session-context.mjs` via Bash to obtain `default_branch`, `ticket_id`, `ticket_ref`, and `scm` from the manifest JSON emitted on stdout; consult [work-types.json](../_data/work-types.json).

2. **Analyze changes**:

   ```bash
   git diff {default_branch}...HEAD
   ```

   Check commit messages for additional context. Then classify the branch, in this order:
   - **Fetch the ticket's labels** where `scm` is `github` and `ticket_id` is non-null:

     ```bash
     gh issue view {ticket_id} --json labels --jq '.labels[].name'
     ```

     Elsewhere, pass no labels. Where the fetch fails, continue without labels and say so; `ticket_type` is then absent.

   - **Classify the range** into a scratch file, created per the path rules of [gh body file](#gh-body-file) and named `classify-{timestamp}.json`. Pass one `--ticket-label` per label:

     ```bash
     classify_path="{absolute path from the scratch-directory step}"
     node {harness_home_dir}/scripts/describe-change.mjs --classify {default_branch} \
       --ticket-label "{label}" > "$classify_path" && cat "$classify_path"
     ```

     [Classifying a commit range](../_data/title-templates.md#classifying-a-commit-range) states the output. The frontmatter call reads `changes` back from this file, so keep its path.

   - **Report** each `unclassified` commit and each `violations` entry to the developer, then continue. Where `head` is `null`, say that the branch yields no head, because no commit was classified; `scope`, `type`, and `breaking` are then left out of the frontmatter.
   - **Resolve the overrides.** `--scope` sets `scope_override`. `--type` sets `type_override`, and a `!` on it sets `breaking_override` rather than staying on the type. Record an override as given, even where it equals the head. The effective type is `type_override` where set, otherwise the head's `type`.
   - **Compare the ticket's type.** Where `ticket_type` is non-null and differs from the effective type, including where there is no effective type, ask the developer which to keep, following [option format](#option-format): the effective type, or the ticket's. Taking the ticket's sets `type_override` to `ticket_type`. Ask here rather than later, since the lede's tier in step 5 follows the type. A session with no developer to ask records both and asks nothing.
   - **Check the breaking policy.** The effective record is breaking where the head or `breaking_override` is. Where that disagrees with the effective type's `breakingPolicy` in [work-types.json](../_data/work-types.json), as a `fix` override on a breaking head does, report it and change nothing.

3. **Compose title**: Compose the change string per [`title-voice.md`](../_data/title-voice.md).
   - The change summary's own heading prefixes that string with the ticket reference for identification: `{ticket_ref} {title}`, or just `{title}` when `ticket_ref` is null.

4. **Compose `## Why` and `## Details`** per the output format below. The lede (`## What`) arrives from a dispatch in step 5, so `## Details` must exist before step 6 can run.

5. **Compose `## What` via `lede-drafter`**: Resolve the tier by looking up the effective type from step 2 in [work-types.json](../_data/work-types.json); where there is none, use `internal`. Then dispatch the `{subagent:lede-drafter}` subagent via the {tool:Task} tool with this block:

   ```dispatch
   type: {resolved type}
   tier: {resolved tier}
   ticket-source: {ticket URL or reference}
   ```

   **The block carries scalars only, and only these keys.** Omit `type` and `ticket-source` where they are unresolved; add `rejection: {code}` on a redispatch and on no other dispatch. Compose no prose into it: the drafter gathers every fact itself, and a sentence written here would seed the draft with this session's weighting, which is the failure the fresh context exists to avoid. A content test fails the build on a line that is not a `key: value` scalar and on a key outside this set, so a new flag is added deliberately rather than by a passing test.

   **A redispatch carries the passages that failed, in a fence below the block.** Step 6 decides which:

   ```rejected
   - {the first passage that failed}
   ```

   Copy each passage character for character from the draft it came from, one per line, and send only the passages that failed: a bullet the drafter never sees is one it cannot change, which is what keeps a bullet that passed from coming back changed. The migration paragraph travels the same way where it is what failed. The drafter returns one replacement per passage, in the order sent; put each in the place of the passage it replaces, and take every other bullet from the draft unchanged. Where the return carries a different number of passages than you sent, none of them can be placed: redispatch with `rejection: unmatched-return`, which counts against the two step 6 allows and exits where step 6 does.

   Take the drafter's `## Lede` section as the content of `## What`, and read its `## Report` for any source it could not reach.

6. **Audit the draft.** Four checks apply to the `## What` returned in step 5, and each names the rejection code its failure raises, where a redispatch is the repair rather than an edit of your own. The drafter composed from the commit log and the diffstat and never read the diff, so this is also where the draft meets it.

   - **Verification.** Read each claim against the diff from step 2. Strike a claim the diff contradicts, and correct one that it states differently. Never add: A fact the draft left out was left out by the reader of the change's shape, and supplying it here restores the weighting that the fresh-context dispatch removed. A sentence that reaches past the commit log and the diffstat without the diff contradicting it is not one to strike: `rejection: unsupported-claim`.
   - **Coverage.** Every fact the lede reports appears in `## Details` too, carrying the mechanics the lede left out. Add to `## Details` what is missing there. Overlap between the two sections is progressive disclosure working, so neither section is trimmed to remove it: A reader meets the summary first and the full story second, and both cover the same ground at different depths.
   - **Subject.** Read each bullet with "This pull request" in front of it. Where that sentence is false, the verb names what the system does rather than what the change did: `rejection: subject`. A change that adds something which itself acts, a command, a check, a rule, a hook, is where this fails most often, because the added thing's behavior is true, interesting, and reads as a correct lede while standing in for the change.
   - **Voice.** A figurative verb, or an invented term where a plain one exists: `rejection: voice`.

   Striking, correcting, and adding to `## Details` are the whole of your authority. Every other failure is a redispatch, never an edit. Do not rewrite the prose yourself: the draft came from a fresh context for the same reason this audit is mechanical, and rewriting it here restores the weighting the dispatch removed.

   Repeat step 5 with `rejection:` set to the code the failed check names, and with the passages that failed in the `rejected` fence that step describes.

   Redispatch at most twice. After a second redispatch fails, the passages still failing are the ones you last sent. Present those to the developer with the code, and ask for a replacement or for an explicit acceptance of each passage as it stands; place the answer, then carry `## What` into step 7. A return you could never place leaves each passage as the fence carried it, which is what the developer is shown. A passage the audit rejected reaches step 7 only once the developer has been asked.

7. **Cut `## What` via `lede-cutter`**: The verified draft reports every fact the drafter judged worth writing; a lede carries only the ones its reader acts on. Dispatch the `{subagent:lede-cutter}` subagent via the {tool:Task} tool with this block, followed by the candidates:

   ```dispatch
   title: {the title composed in step 3, without the ticket reference}
   tier: {the tier resolved in step 5}
   ```

   ```candidates
   - {the first bullet of the verified draft}
   - {the second bullet}
   ```

   Copy each candidate from the verified draft character for character, one per line, and number none of them: the cutter returns the survivors verbatim, and anything added here has to be stripped back out. Add `rejection: {code}` on a redispatch and on no other dispatch, taking the code from the check that failed below.

   **The migration paragraph is not a candidate.** Where the lede carries one, hold it aside and re-attach it below the surviving bullets. Only `## What` reaches the merge commit and the changelog, so that paragraph is the whole channel to a consumer whose build just broke, and it survives every cut.

   **A single-bullet lede skips the dispatch.** The cut leaves at least one bullet, so a lede that already has one has nothing to give up.

   **Check the return before taking it.** Write the candidates and the returned bullets to two files, then compare them, naming each file by the absolute path it was written to:

   ```bash
   grep -Fxv -f "{candidates_file}" "{returned_file}"
   ```

   Each line it prints is a bullet the cutter wrote rather than kept. `grep` exits 1 when it prints nothing, which is the passing case, so read the printed lines rather than the exit status.

   **Count the returned bullets too.** The empty set is a subset, so the comparison above passes a return carrying no bullets at all. An empty `## What` reaches `merge-pr`, which reads a body under 30 characters as thin and composes a fresh one from the diff, so the pipeline's output is discarded without a word.

   Redispatch on either failure -- `rejection: not-a-subset` for a bullet the cutter wrote, `rejection: empty-cut` for a return carrying none -- at most twice across the two; after a second failure, take the verified draft uncut and report the failure to the developer.

   Take the surviving bullets as the content of `## What`, in the order they were sent, and read the cutter's `## Report` for what it dropped. Relay that to the developer: this is the one step that removes content, and the saved summary shows only what survived it.

8. **Save** per the [Saving](#saving) section.

If expected information is missing, stop and ask the developer.

## Output format

The artifact begins with a single YAML frontmatter block that unifies canonical fields from the canonical schema with change-summary-specific consumer fields; see the canonical example in [artifact-conventions.md](../_data/artifact-conventions.md#universal-artifact-frontmatter) and the consumer-field extensions in [Change-summary frontmatter](../_data/artifact-conventions.md#change-summary-frontmatter). Ordering: `provenance:` first, then top-level canonical fields, then consumer fields. `commit:` and `ticket_id:` appear exactly once each. Field-resolution steps are stated in the [Canonical-field resolution](#canonical-field-resolution) section below.

The body following the frontmatter has this structure:

```markdown
# {ticket_ref} {title}

## What

{The lede: drafted in Process step 5, audited in step 6, and cut to its surviving bullets in step 7.}

## Why

{1-3 sentences describing the _motivation_: what was wrong, what was missing, or what new capability is needed. Frame in terms of consequences (for users, the codebase, future work), not mechanism. Mechanism belongs in `## Details`.

Bad: "The retry helper used a fixed backoff schedule with no shared state, so concurrent requests stacked up against the upstream rate limiter."
Good: "Heavy-upload sessions were intermittently failing as users hit the upstream API's rate limit."}

## Details

### 🎉 Features

{Only if applicable}

### 🐛 Bug fixes

{Only if applicable}

### ♻️ Refactoring

{Only if applicable}

### 🧪 Tests

{Only if applicable}

### 📦 Dependencies

{Only if applicable}
```

## Guidance

- When `ticket_ref` is null (no ticket on the branch), omit the `{ticket_ref} ` portion of the heading and the title so they read naturally without it.
- The change summary follows **newspaper style**, progressive disclosure from most to least essential: `## What` is the lede, `## Why` is the context (motivation and background), `## Details` is the full story (implementation mechanics)
- Ignore auto-formatter and lint-fix changes
- Omit inapplicable Details subsections
- Subsection headings use `{emoji} {label}` from the matching [work-types.json](../_data/work-types.json) `types[]` entry. For any subsection not enumerated in the example template above, look up the entry by work-type key and use its `emoji` and `label`.
- Order Details subsections per `work-types.json` tier order: public → internal → process.
- Prefix any individual `## Details` entry that describes a breaking change with `🚨 **Breaking:** ` (drawn from `markers.breaking` in [work-types.json](../_data/work-types.json), rendered as `{emoji} **{label}:** `). Trigger conditions: An entry that the step-2 classification reports with `breaking: true`, or a commit with a `BREAKING CHANGE:` footer. The entry stays under its work-type subsection: The prefix tags it inline rather than relocating it to a separate section. The prefix does not carry the migration: `## Details` reaches no consumer, so a breaking change states what the consumer does in a `Migration:` paragraph in `## What`.
- `## What` and `## Why` are required; Details subsections are optional
- Never list automated checks (formatting, linting, typechecking, unit tests) in a test plan. They run automatically in CI.

<!-- include: ../../_partials/prose-line-breaks.md / -->

<!-- include: ../_partials/nested-list-indent.md / -->

## Frontmatter inference

The single YAML frontmatter block contains both canonical identity fields from the [universal artifact frontmatter](../_data/artifact-conventions.md#universal-artifact-frontmatter) and change-summary-specific consumer fields read by downstream PR-creation skills (`create-pr`, `create-gh-pr`, `create-bitbucket-pr`). `commit:` and `ticket_id:` appear exactly once and serve a dual role: canonical identity fields that downstream consumers may also read.

The block is structured as:

1. `provenance:` block (canonical nested fields: `skill`, `timestamp`, `baseSha`, `isInteractive`, `model`).
2. Top-level canonical fields: `branch`, `commit`, `pr`, `ticket_id`, `ticket_ref`, `run_id`.
3. Consumer extensions: `title`, `scope`, `type`, `breaking`, `changes`, `ticket_type`, `scope_override`, `type_override`, `breaking_override`.

### Canonical-field resolution

Source `{model_id}` from your system-prompt environment block: the line `model named ... model ID is ...`. Resolve the consumer extensions per [Consumer fields](#consumer-fields) below.

Run via Bash, writing each resolved scalar into the call as literal text and dropping the whole flag for a field that is absent. `changes` is read from the step-2 classification file inside the same call, so no entry is retyped into a command, where a backtick, `$`, or `"` in it would be expanded or would end the argument:

```bash
classify_path="{absolute path of the step-2 classification file}"
[ -s "$classify_path" ] || { echo "Classification file missing or empty: $classify_path" >&2; exit 1; }
changes=()
while IFS= read -r change; do changes+=(--extra-list-item "changes=$change"); done < <(jq -r '.entries[].change' "$classify_path")
{harness_home_dir}/scripts/resolve-frontmatter.sh \
  --skill summarize-change \
  --interactive true \
  --model "{model_id}" \
  --extra "title={title}" \
  --extra "scope={scope}" \
  --extra "type={type}" \
  --extra "breaking=true" \
  "${changes[@]}" \
  --extra "ticket_type={ticket_type}" \
  --extra "scope_override={scope_override}" \
  --extra "type_override={type_override}" \
  --extra "breaking_override=true"
```

Dropping a flag is what keeps an absent field out of the emitted frontmatter. `--extra "breaking=true"` and `--extra "breaking_override=true"` appear only where that field is `true`.

Prepend the script's output verbatim to the artifact body.

### Consumer fields

- **`title`**: The bare title without the `ticket_ref` prefix. If `ticket_ref` is `#409` and the heading is `#409 Rationalize PR creation skills`, the title is `Rationalize PR creation skills`. When `ticket_ref` is null, the title is the entire heading text.
- **`scope`**, **`type`**, and **`breaking`**: The step-2 classification's `head`, each absent where the head does not determine it, and `breaking` only where it is `true`. They record what the branch derived and never an override.
- **`changes`**: Each entry's `change`, oldest first, read from the classification file.
- **`ticket_type`**: The classification's `ticket_type`, absent where it is `null`.
- **`scope_override`**, **`type_override`**, and **`breaking_override`**: The overrides resolved in step 2, each absent where unset, and `breaking_override` only where it is `true`.

A consumer reads the classification by applying the overrides to the head, per [The effective record](../_data/change-record.md#the-effective-record).

## As a PR description

When used as a PR description, include **from `## What` onward only**; omit the H1 title and metadata block.

## Saving

### Path resolution

Invoke `node {harness_home_dir}/skills/derive-session-context/derive-session-context.mjs` via Bash to obtain `artifact_base_dir`, `project_slug`, and `ticket_id` from the manifest JSON emitted on stdout (the same invocation in step 1 already populated the manifest file, so this is a fast-path read).

Follow [artifact conventions](../_data/artifact-conventions.md).

Ticket directory: `{artifact_base_dir}/projects/{project_slug}/tickets/{ticket_id}/`

Artifact type: `change-summary`. Filename format:

```
{timestamp}_{slug}_change-summary.md
```

Example: `20250121-1530Z_auto-share-exception_change-summary.md`

<!-- include: ../_partials/option-format.md / -->

<!-- include: ../_partials/gh-body-file.md / -->
