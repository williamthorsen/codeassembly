---
name: refine-guidance
description: Turn a lesson into a guidance change, conversationally. Finds the rule that already states the lesson or places a new artifact per the content specification, confirms the placement, drafts the edits for approval, applies them, opens a pull request, and marks any feedback events that the lesson came with as addressed by it. Use when a lesson from the conversation, a pasted finding, or a triage-feedback ticket should become a change to a skill, subagent, rulebook, partial, or AGENTS.md.
user-invocable: true
---

# Refine guidance

Turn one lesson into one guidance pull request. You find whether a rule already states the lesson, place the change, draft the edits, and deliver them; the developer approves the placement and then the edits. A rule that exists and keeps failing is the common case, and it calls for changing that rule rather than adding a parallel one.

**Announce at start:** "Using refine-guidance to turn this lesson into a guidance change."

## Arguments

| Argument         | Description                                                                                         | Required |
| ---------------- | --------------------------------------------------------------------------------------------------- | -------- |
| `[target]`       | A guidance file to change: a source file or a deployed copy. Without one, step 4 places the change. | No       |
| `--ticket <ref>` | A ticket that states the lesson, such as one that {skill?:triage-feedback} filed.                   | No       |

The lesson comes from the conversation when the conversation states one. Otherwise it comes from `--ticket`, and without that, from the branch's ticket.

## Prerequisites

Placement follows the `codeassembly-content-specification` rulebook, which deploys as the `consult-codeassembly-content-specification` skill in a repository that declares it. When it is not deployed, report that and stop before step 4.

## Never edit

- Text inside a generated region, which the next deployment rewrites.
- A deployed copy. Edit its source, which step 3 resolves.
- A file in another repository. Step 4 offers a ticket there instead.

## Process

### 1. Preflight

Run `node {harness_home_dir}/skills/derive-session-context/derive-session-context.mjs` and read `branch_name`, `default_branch`, and `ticket_id`. Stop on the default branch, and report that the change needs a ticket branch: This skill commits and opens a pull request from the current branch.

### 2. Resolve the lesson

Take the lesson from the conversation or from a finding pasted into it. When the conversation does not state one, resolve `--ticket`, or else the branch's ticket, per [ticket source resolution](../_data/ticket-source-resolution.md), and take the lesson from the ticket. Restate the lesson in one sentence: the behavior that the agent showed and the behavior that the lesson asks for.

Collect any feedback event ids that the input contains, with their store. An event id is a ULID, 26 Crockford base32 characters; a {skill?:triage-feedback} ticket lists them in its context under the store name. When the input names ids without a store, the store is `@feedback`. Input without ids makes step 9 a no-op.

### 3. Find existing coverage

Search the guidance for a rule that states the lesson: the library's content, the repository's `.agents/content`, and its `AGENTS.md`. Search with `rg` on the lesson's key terms, then read each matching section and the descriptions of the rulebooks that it reaches. A rule states the lesson when following its directive would have prevented the behavior that the lesson describes. A rule that covers the lesson in part is still the rule to change.

Run `resolve` on the target, or on the files that the search found:

```bash
node {harness_home_dir}/skills/streamline-guidance/streamline-guidance.mjs resolve {paths}
```

It maps each deployed copy to its source (`redirectedFrom`) and reports each file's `dirty` state and `generatedRegions`. Report every redirect. Stop if a file to be edited is `dirty`, and name it: The commit must contain only this run's edits.

### 4. Place the change

Decide the mode, and give its reason in one sentence:

- **An existing rule states the lesson**: `strengthen`, `relocate`, or `illustrate` it, per "Choosing a kind" in the content specification.
- **The guidance does not state it**: a new artifact, `new {kind} in {content root}`, with the kind and the content root chosen per the same section.

Decide which repository owns the target. A file with a `<!-- codeassembly-` marker, or a file in the CodeAssembly guidance library, belongs to the CodeAssembly repository, per [deployed-file provenance](../_data/deployed-file-provenance.md); a project's `.agents/content` file or `AGENTS.md` belongs to that project's repository. When the owner is not the current repository, do not edit the file: Offer to file the lesson there with {skill:create-ticket} `--repo {repo}`, and stop.

Present the placement: the lesson, the mode and its reason, and the target file or the new artifact's path. Ask for confirmation before drafting.

### 5. Draft the edits

Draft under "Adding guidance" in the content specification: Change the fewest surfaces that plausibly account for the behavior, and trim any text that the change makes redundant, in that file or another. A new artifact follows the content specification and the repository's content conventions: its frontmatter, its naming, its dependency declarations, and the tests that the repository runs over its content.

Present each edit as a numbered row: file, line, the text that it replaces (or `new file`), and the new text. Ask for one approval that covers applying the edits, the commit, the push, and the pull request. A row that the developer declines is dropped; re-draft only when the developer asks.

### 6. Apply

<!-- include: ../_partials/apply-guidance-edits.md / -->

### 7. Commit

Commit per {skill:create-commit}, passing the edited paths and the purpose `{mode}: {reason}` from step 4.

### 8. Open the pull request

Push with `git push --set-upstream origin HEAD`, which the approval in step 5 covers: {skill:create-pr} does not push, and it stops when the branch is not up to date with its remote. On a failed push, report it and stop. Then open the pull request with {skill:create-pr}.

### 9. Mark the events

Skip this step when step 2 did not collect any event id: This skill does not write to a knowledge base otherwise.

Mark the events with {skill:kb-update-events}: `--store {store} --add-addressed-by={pull request URL}` and the event ids. Report each id whose result has `ok: false`.

### 10. Report

Report the pull request's URL, the mode and its reason, the edited files, the marked event ids, and each id that failed. When an edited file is larger than before, offer {skill:streamline-guidance} on it in the action-items block, per "Adding guidance": That run commits on the same branch, which adds its cuts to the open pull request. The block contains nothing else.

<!-- include: ../_partials/action-items.md / -->
