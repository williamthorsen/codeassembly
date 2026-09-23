---
name: summarize-change
description: Analyze changes and generate structured summary for PR preparation
user-invocable: true
---

# Summarize change

Analyze the current branch's changes since diverging from the default branch.

The change's consolidated record is derived from the change entries and recorded per [the change record](../_data/change-record.md). The body ends with the rendered `change-record` block, which carries the entries and that record to the pull request.

## Arguments

| Flag              | Effect                                                                              |
| ----------------- | ----------------------------------------------------------------------------------- |
| `--scope {scope}` | Overrides the consolidated scope.                                                   |
| `--type {type}`   | Overrides the consolidated work type. A `!` on it (`feat!`) adds the breaking mark. |

Both are optional, and each is recorded as an override beside the consolidated record rather than in place of it.

## Process

1. **Gather context**:
   - Invoke `node {harness_home_dir}/skills/derive-session-context/derive-session-context.mjs` via Bash to obtain `default_branch`, `ticket_id`, `ticket_ref`, and `scm` from the manifest JSON emitted on stdout; consult [work-types.json](../_data/work-types.json).

2. **Analyze changes**:

   ```bash
   git diff {default_branch}...HEAD
   ```

   Check commit messages for additional context. Then consolidate the branch, in this order:
   - **Fetch the ticket's labels** when `scm` is `github` and `ticket_id` is non-null:

     ```bash
     gh issue view {ticket_id} --json labels --jq '.labels[].name'
     ```

     Otherwise, pass no labels. If the fetch fails, continue without labels and say so; `ticket_type` is then absent.

   - **Consolidate the range** into a scratch file, created per the path rules of [gh body file](#gh-body-file) and named `consolidation-{timestamp}.json`:

     ```bash
     consolidation_path="{absolute path from the scratch-directory step}"
     node {harness_home_dir}/scripts/describe-change.mjs consolidate-branch --base {default_branch} \
       > "$consolidation_path" && cat "$consolidation_path"
     ```

     [`consolidate-branch`](../_data/title-templates.md#consolidate-branch) states the output. The frontmatter call reads `changes` back from this file, so keep its path.

     This consolidation serves `changes`, the unmatched and violation report below, and the tier that step 5 seeds the drafter with. It is not what the frontmatter's `scope`, `type`, and `breaking` record: Step 7 consolidates those from the change entries, which do not exist yet.

     If the call fails, as it does when `commit.title_format` is empty, it leaves the file empty. Relay its error and continue without a consolidated record: `changes` is left out, and step 7 consolidates the record from the entries as it does on any run.

   - **Resolve the ticket's type** if the fetch returned labels, passing one `--ticket-label` per label. If there are none, skip the call; `ticket_type` is then absent.

     ```bash
     node {harness_home_dir}/scripts/describe-change.mjs resolve-ticket-type \
       --ticket-label "{label}"
     ```

     Read `ticket_type` from the output, leaving it absent if it is `null`; [`resolve-ticket-type`](../_data/title-templates.md#resolve-ticket-type) states when it is. If the call fails, relay its error and continue with `ticket_type` absent.

   - **Report** each `unmatched` subject and each `violations` entry to the developer, then continue. If every field of `consolidated_record` is `null`, say that the branch yields no commit entries and continue; the tier that step 5 seeds falls back to `internal`.
   - **Resolve the overrides.** `--scope` sets `override_scope`. `--type` sets `override_type`, and a `!` on it sets `override_breaking` rather than staying on the type. Record an override as given, even if it equals the consolidated record.
   - **Resolve the effective record** from the consolidated record and the overrides:

     ```bash
     node {harness_home_dir}/scripts/describe-change.mjs resolve-effective-record \
       --scope "{scope}" \
       --type "{type}" \
       --breaking \
       --override-scope "{override_scope}" \
       --override-type "{override_type}" \
       --override-breaking
     ```

     Omit each flag whose field is absent, and pass `--breaking` and `--override-breaking` only if that field is `true`. The effective type is the output's `effective_record.type`; [`resolve-effective-record`](../_data/title-templates.md#resolve-effective-record) states the output. If the call fails, relay its error and continue with no effective type.

   - **Type the change from the diff.** Apply [Work type test](#work-type-test) to the diff and resolve the type from that, whatever the consolidated record and `ticket_type` name. Agreement between the two is not evidence: The commits are often typed from the ticket's label, so one misclassification reaches both. When the test's type differs from the effective type, set `override_type` to it and re-run `resolve-effective-record`. Ask the developer only when the test leaves two types genuinely close, following [option format](#option-format): A clear result is a decision to state in one line with its reason, not a menu. Resolve here rather than later, since the lede's tier in step 5 follows the type. A session with no developer to ask takes the test's type: Set `override_type` to it, which the frontmatter records beside the consolidated `type` and `ticket_type`, and ask nothing.
   - **Check the breaking policy.** Report each `policy-violation` in the last run's `defects`, such as the one that a `refactor` override on a breaking consolidated record produces, and change nothing.

3. **Compose title**: Compose the change string per [`title-voice.md`](../_data/title-voice.md).
   - The change summary's own heading prefixes that string with the ticket reference for identification: `{ticket_ref} {title}`, or just `{title}` when `ticket_ref` is null.

4. **Compose `## Why`** per the output format below. `## What` and `## Details` both come from what step 5 draws, so neither exists until step 8.

5. **Draft the lede and the entries via `entry-drafter`**: Resolve the tier by looking up the effective type from step 2 in [work-types.json](../_data/work-types.json); if there is none, use `internal`. Then dispatch the `{subagent:entry-drafter}` subagent via the {tool:Task} tool with this block:

   ```dispatch
   type: {resolved type}
   tier: {resolved tier}
   ticket-source: {ticket URL or reference}
   ```

   **The block contains scalars only, and only these keys.** Omit `type` and `ticket-source` if they are unresolved; add `rejection: {code}` on a redispatch and on no other dispatch. Compose no prose into it: The drafter gathers every fact itself, and a sentence written here would introduce this session's weighting into the draft, which is the failure that the fresh context exists to avoid. A content test fails the build on a line that is not a `key: value` scalar and on a key outside this set, so a new flag is added deliberately rather than by a passing test.

   **A redispatch includes the passages that failed, in a fence below the block.** Step 6 decides which:

   ```rejected
   - {the first passage that failed}
   ```

   Copy each passage character for character from the draft from which it came, one per line, and send only the passages that failed: The drafter cannot change a passage that it never sees, which keeps one that passed from coming back changed. Send the lede or the migration paragraph the same way if it is what failed. The fence carries the lede or an entry's `text`, so the drafter returns one replacement passage per passage sent, in the order sent; put each in the place of the passage that it replaces, keep that entry's `type`, `scopes`, and `breaking`, and take the lede and every other entry from the draft unchanged. If the return contains a different number of passages than you sent, none of them can be placed: Redispatch with `rejection: unmatched-return`, which counts against the two redispatches that step 6 allows and exits as step 6 does.

   On a first dispatch, take the drafter's `## Lede` section as it stands; step 9 makes it `## What`, and no step rewrites it. A redispatch returns every replacement under `## Entries` and no `## Lede` section at all, so the lede it carries forward is whichever text the placement above left in the lede's place. Parse the `## Entries` fence as YAML. Each entry carries `type`, `scopes`, `breaking`, and `text`. Hold any `Migration:` paragraph below the fence aside, and read the `## Report` for any source that the drafter could not access. Report to the developer any `type` that names no key in [work-types.json](../_data/work-types.json) and continue; the rendering rule below states the heading that such an entry takes, and resolving the type here would substitute this session's judgment for the drafter's.

6. **Audit the lede and the entries.** Three checks apply to the lede and to each entry's `text` alike, and each names the rejection code that its failure raises, for which a redispatch is the repair rather than an edit of your own. `type`, `scopes`, and `breaking` are not prose and are never rejected.

   - **Verification.** Read the lede and each entry's `text` against the diff from step 2. Strike a claim that the diff contradicts, and correct one that it states differently. Never add: A fact omitted from the draft was left out by the reader of the change, and supplying it here restores the weighting that the fresh-context dispatch removed. The drafter read the diff, so this check no longer supplies the draft's grounding; it catches a sentence claiming more than the diff supports, which the diff does not contradict and which is not one to strike: `rejection: unsupported-claim`.
   - **Subject.** Read the lede's each sentence, and each entry's `text`, with "This pull request" in front of it. If that sentence is false, the verb names what the system does rather than what the change did: `rejection: subject`. This check fails most often on a change that adds something which itself acts, such as a command, a check, a rule, or a hook, because the added thing's behavior is true, interesting, and reads as a correct entry while standing in for the change.
   - **Voice.** A figurative verb, or an invented term when a plain one exists: `rejection: voice`.

   Striking and correcting a sentence are the whole of your authority. Every other failure is a redispatch, never an edit. Do not rewrite the prose yourself: The draft came from a fresh context for the same reason this audit is mechanical, and rewriting it here restores the weighting that the dispatch removed.

   Repeat step 5 with `rejection:` set to the code that the failed check names, and with the passages that failed in the `rejected` fence that step describes.

   Redispatch at most twice. After a second redispatch fails, the passages still failing are the ones that you last sent. Present those to the developer with the code, and ask for a replacement or for an explicit acceptance of each passage as it stands; place the answer, then continue to step 7 with the verified entries. If you could never place a return, show the developer each passage as the fence contained it. Take a passage rejected by the audit past step 6 only after asking the developer.

7. **Consolidate the change's record from the entries.** Do this before step 8, and before the frontmatter call: The `## Details` headings, the title, the labels, and the block all read the record that this step produces.
   - **Write the verified entries** to a scratch file, created per the path rules of [gh body file](#gh-body-file) and named `entries-{timestamp}.yaml`. The file is a top-level YAML list of mappings, one per entry, each carrying `type`, `scopes`, `breaking`, and `text` as the drafter returned them, with the corrections that step 6 made. Write it with a file-writing tool rather than a shell heredoc: `text` is arbitrary prose containing backticks and quotes. Keep its path; step 10 reads the same file.
   - **Record the derivation commit**: `git rev-parse --short HEAD`. It is the commit at which the entries were read, and `resolve-merge` compares it against the pull request's head to tell a fresh block from a stale one.
   - **Consolidate the entries:**

     ```bash
     entries_path="{absolute path from the write step}"
     node {harness_home_dir}/scripts/describe-change.mjs consolidate-entries --entries-file "$entries_path"
     ```

     [`consolidate-entries`](../_data/title-templates.md#consolidate-entries) states the output. Its `consolidated_record` is what the frontmatter's `scope`, `type`, and `breaking` record, each absent when it is `null` and `breaking` only when it is `true`. If the call fails, relay its error and leave all three out.

   - **Re-resolve the effective record** by running `resolve-effective-record` again, on this consolidated record and the overrides resolved in step 2. The first run in step 2 used the commit-derived record, which this one supersedes, and the title and the labels downstream read the effective record. Report each `policy-violation` in `defects` and change nothing.

8. **Render `## Details` from the verified entries** per [Rendering `Details`](#rendering-details).

9. **Compose `## What`** from the drafter's lede: the `## Lede` section as step 6 left it, followed by the held-aside `Migration:` paragraph when the draft carries one, separated by one blank line. Write nothing of your own into it, and take no sentence from the entries: The lede was written in a fresh context for the reader who meets the change without them, and a sentence added here carries this session's weighting into the merge commit, the changelog, and the release notes.

   Because only `## What` appears in the merge commit and the changelog, the migration paragraph is the only text there addressed to a consumer whose build just broke, which is why it travels with the lede rather than staying with the entries.

10. **Render the `change-record` block** and make it the body's last element:

    ```bash
    entries_path="{absolute path from step 7}"
    node {harness_home_dir}/scripts/describe-change.mjs render-block \
      --title "{title}" \
      --scope "{scope}" \
      --type "{type}" \
      --breaking \
      --override-scope "{override_scope}" \
      --override-type "{override_type}" \
      --override-breaking \
      --entries-file "$entries_path" \
      --entries-commit "{the short SHA from step 7}" \
      | python3 -c "import sys,json; print(json.load(sys.stdin).get('block',''))"
    ```

    Pass the step-7 consolidated record through `--scope`, `--type`, and `--breaking`, never the effective record: The block records the consolidation and the overrides separately, and `resolve-merge` applies the overrides itself. Omit each flag whose field is absent, and pass `--breaking` and `--override-breaking` only if that field is `true`.

    [`render-block`](../_data/title-templates.md#render-block) states the output, which is JSON; the last command decodes it and prints the `block` field. Render and decode in one Bash invocation, and write the printed block verbatim below `## Details`, separated by one blank line. Never copy the block out of the raw JSON: `text` is arbitrary prose, and JSON escapes its quotes and backslashes a second time.

    `create-pr` carries this block into the pull-request body rather than rendering one of its own, so a body saved without one reaches the pull request without one. If the helper is unavailable or the call fails, relay its error, say that the summary carries no block, and save the body without one.

11. **Save** per the [Saving](#saving) section.

If expected information is missing, stop and ask the developer.

## Work type test

<!-- include: ../../_partials/work-type-choice.md / -->

## Output format

The artifact begins with a single YAML frontmatter block that unifies canonical fields from the canonical schema with change-summary-specific consumer fields; see the canonical example in [artifact-conventions.md](../_data/artifact-conventions.md#universal-artifact-frontmatter) and the consumer-field extensions in [Change-summary frontmatter](../_data/artifact-conventions.md#change-summary-frontmatter). Ordering: `provenance:` first, then top-level canonical fields, then consumer fields. `commit:` and `ticket_id:` appear exactly once each. Field-resolution steps are stated in the [Canonical-field resolution](#canonical-field-resolution) section below.

The body following the frontmatter has this structure:

````markdown
# {ticket_ref} {title}

## What

{The drafter's lede, with any `Migration:` paragraph below it.}

## Why

{1-3 sentences describing the _motivation_: what was wrong, what was missing, or what new capability is needed. Frame in terms of consequences (for users, the codebase, future work), not mechanism.

Bad: "The retry helper used a fixed backoff schedule with no shared state, so concurrent requests stacked up against the upstream rate limiter."
Good: "Heavy-upload sessions were intermittently failing as users hit the upstream API's rate limit."}

## Details

### 🎉 Features

- Adds the store-qualified wikilink `[[store:Note title]]`, which `kb check` resolves against the named store. #agents, #kb
- Adds `visibility` to `.kb/config.yaml`, taking `shared` or `private`. #agents

### 🐛 Bug fixes

- 🚨 **Breaking:** Stops `kb check` resolving a bare wikilink against every store. #kb

```change-record
title: Add the store-qualified wikilink
consolidated_record:
  scope: agents
  type: feat
entries_commit: e5029924
entries:
  - type: feat
    scopes:
      - agents
      - kb
    breaking: false
    text: Adds the store-qualified wikilink `[[store:Note title]]`, which `kb check` resolves against the named store.
```
````

### Rendering `Details`

`## Details` is rendered from the verified entries, and nothing else is composed into it. It is present on every change that yields an entry.

- **Subsections.** One per distinct `type` among the entries, headed `{emoji} {label}` from that type's [work-types.json](../_data/work-types.json) `types[]` entry. Order them by tier (public → internal → process) and, within a tier, in the order that `work-types.json` lists the types. A type with no entry gets no subsection.
- **Bullets.** Under each subsection, one bullet per entry of that type, in the order the drafter returned them. The bullet is `🚨 **Breaking:** ` (from `markers.breaking`, rendered as `{emoji} **{label}:** `) when the entry's `breaking` is `true`, followed by the entry's `text`. The prefix tags the entry inline rather than relocating it to a separate section.
- **Scope tags.** When the entries do not all name the same `scopes`, each bullet ends with one space and its scopes as bare `#scope` tags, comma-separated: `#agents, #kb`. When every entry names the same scopes, no bullet carries tags, since the consolidated record already names that scope.
- **`## What`.** `## What` carries none of these bullets. It is the lede that the drafter wrote, composed in step 9, and the two sections therefore cover the change at different lengths rather than repeating one list.
- **An unknown type.** A `type` naming no key in `work-types.json` has no `emoji` or `label` to head a subsection with, and no tier to order it by. Report it to the developer per step 5 and head that subsection with the bare `type`, after every subsection that the taxonomy orders, so that the entry stays visible rather than being dropped or reassigned.

## Guidance

- When `ticket_ref` is null (no ticket on the branch), omit the `{ticket_ref} ` portion of the heading and the title so that they read naturally without it.
- The change summary follows **newspaper style**, progressive disclosure from most to least essential: `## What` is the lede, `## Why` is the context (motivation and background), `## Details` is every outcome that the change contains
- Both `## What` and `## Details` come from the drafter, so neither is composed in this session
- Ignore auto-formatter and lint-fix changes
- The breaking prefix does not include the migration: A breaking change states what the consumer does in a `Migration:` paragraph in `## What`, which is the text that the merge commit and the changelog carry
- `## What` and `## Why` are required
- The rendered `change-record` block is the body's last element, per [the change record](../_data/change-record.md)
- Never list automated checks (formatting, linting, typechecking, unit tests) in a test plan. They run automatically in CI.

<!-- include: ../../_partials/prose-line-breaks.md / -->

<!-- include: ../_partials/nested-list-indent.md / -->

## Frontmatter inference

The single YAML frontmatter block contains both canonical identity fields from the [universal artifact frontmatter](../_data/artifact-conventions.md#universal-artifact-frontmatter) and change-summary-specific consumer fields read by downstream PR-creation skills (`create-pr`, `create-gh-pr`, `create-bitbucket-pr`). `commit:` and `ticket_id:` appear exactly once and serve a dual role: canonical identity fields that downstream consumers may also read.

The block is structured as:

1. `provenance:` block (canonical nested fields: `skill`, `timestamp`, `baseSha`, `isInteractive`, `model`).
2. Top-level canonical fields: `branch`, `commit`, `pr`, `ticket_id`, `ticket_ref`, `run_id`.
3. Consumer extensions: `title`, `scope`, `type`, `breaking`, `changes`, `ticket_type`, `override_scope`, `override_type`, `override_breaking`.

### Canonical-field resolution

Source `{model_id}` from your system-prompt environment block: the line `model named ... model ID is ...`. Resolve the consumer extensions per [Consumer fields](#consumer-fields) below. Run this after step 7, whose consolidated record `scope`, `type`, and `breaking` carry.

Run via Bash, writing each resolved scalar into the call as literal text and dropping the whole flag for a field that is absent. `changes` is read from the step-2 consolidation file inside the same call, so that no entry is retyped into a command, in which a backtick, `$`, or `"` would be expanded or would end the argument. A file that a failed consolidation left empty yields no `changes`:

```bash
consolidation_path="{absolute path of the step-2 consolidation file}"
changes=()
if [ -s "$consolidation_path" ]; then
  while IFS= read -r change; do changes+=(--extra-list-item "changes=$change"); done < <(jq -r '.entries[].change' "$consolidation_path")
fi
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
  --extra "override_scope={override_scope}" \
  --extra "override_type={override_type}" \
  --extra "override_breaking=true"
```

Dropping a flag keeps an absent field out of the emitted frontmatter. `--extra "breaking=true"` and `--extra "override_breaking=true"` appear only if that field is `true`.

Prepend the script's output verbatim to the artifact body.

### Consumer fields

- **`title`**: The bare title without the `ticket_ref` prefix. If `ticket_ref` is `#409` and the heading is `#409 Rationalize PR creation skills`, the title is `Rationalize PR creation skills`. When `ticket_ref` is null, the title is the entire heading text.
- **`scope`**, **`type`**, and **`breaking`**: The step-7 `consolidated_record`, consolidated from the change entries, each absent if it is `null` and `breaking` only if it is `true`. They record the consolidated record and never an override.
- **`changes`**: Each commit entry's `change`, oldest first, read from the step-2 consolidation file. It is the commit-derived list, which the change entries do not replace: The two answer different questions, and a reviewer reads `changes` to see what the branch's commits declared.
- **`ticket_type`**: The step-2 `ticket_type`, absent if it is `null` or unresolved.
- **`override_scope`**, **`override_type`**, and **`override_breaking`**: The overrides resolved in step 2, each absent if unset, and `override_breaking` only if it is `true`.

A skill that needs the effective record reads it from [`resolve-effective-record`](../_data/title-templates.md#resolve-effective-record), run on these fields.

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
