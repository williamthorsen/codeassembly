---
name: design-and-plan
description: Interactive design exploration followed by ticket refinement and implementation planning
user-invocable: true
dependencies:
  skills:
    - save-artifact
    - testing-conventions
---
<!-- codeassembly-skill:design-and-plan -->

# Design and plan

Interactive design exploration followed by ticket refinement and implementation planning. Produces two artifacts: a refined ticket and an implementation plan.

**Announce at start:** "Using design-and-plan to explore requirements and produce a ticket + implementation plan."

## Arguments

- Task source (required): Issue URL, shorthand reference (`#99`, `issue 99`), file path, or description of what to build
- `--check-staleness` (optional): Always run the relevancy check, regardless of the heuristic
- `--skip-staleness` (optional): Never run the relevancy check, regardless of the heuristic

## Overview

Turn a task into a well-defined ticket and actionable implementation plan through collaborative dialogue. Explore requirements interactively, converge on a design, and produce two artifacts that together give a competent coder everything they need.

<HARD-GATE>
Do NOT generate the implementation plan until the ticket has been approved. This applies regardless of perceived simplicity.
</HARD-GATE>

<!-- codeassembly-guidance-hook:ticketing-preferences:start -->
<!-- rulebook:williamthorsen-ticketing-preferences -->
<!-- rulebook-version: 6 -->
## William Thorsen's ticketing preferences

### Splitting work across tickets

When work deserves more than one pull request, give each pull request its own ticket. When splitting a ticket into two, keep the first piece in the originating ticket. When splitting into more, make the originating ticket an umbrella.

A piece gets its own ticket when it can be merged and verified on its own, not when it looks large enough to deserve one. When the count is a judgment, cut finer: Merging two tickets that turned out to be one costs an edit and a close, while splitting one that turned out to be four costs a rewrite of the original, new children, a re-cut plan, and whatever was committed against the superseded contract.

This governs work already judged to need more than one pull request. Whether work discovered mid-change becomes a ticket at all is decided first by the fold-in default in [scope-and-deferral.md](~/.claude/skills/_sources/codeassembly-guidance/_data/scope-and-deferral.md).

Record the relationships natively when the tracker supports them -- blockers, and parent to child -- rather than as prose in a body. Record a blocker when there is some probability that one ticket affects another and should be merged first, not only when that is certain: A ticket whose design takes another ticket's outcome as an input is blocked by it.

### Counts in a ticket body

State a condition rather than a measurement: "the record covers one file and contains rejections taken at older rule versions", not "257 candidates, 8 of them stale". Admit a figure only when it defines the work: a budget, a threshold, or a value that an acceptance criterion is checked against. A count in an existing ticket that has since drifted is not a defect: Do not re-measure it, report it, or propose an edit to correct it.
<!-- /rulebook:williamthorsen-ticketing-preferences -->
<!-- codeassembly-guidance-hook:ticketing-preferences:end -->

## Process

### Phase 1: Resolve task source and assess relevancy

1. **Resolve the task source** using the [ticket source resolution](~/.claude/skills/_sources/codeassembly-guidance/_data/ticket-source-resolution.md) table. Request the `updatedAt` field for use in the relevancy check. Store the resolved metadata for use in the relevancy check and Phase 5's optional remote update. When the source resolves to a URL, persist it to the branch manifest per [Stored ticket URL](~/.claude/skills/_sources/codeassembly-guidance/_data/ticket-source-resolution.md#stored-ticket-url) so that a later session does not need a ticket argument. Then report the ticket's open blockers per [Open blockers](~/.claude/skills/_sources/codeassembly-guidance/_data/ticket-source-resolution.md#open-blockers), whether or not the relevancy check runs, and continue: A blocker does not stop design. Then check the branch per [branch currency](~/.claude/skills/_sources/codeassembly-guidance/_data/branch-currency.md) before exploring the codebase, reading `branch_name` and `default_branch` from the manifest that `node ~/.claude/skills/_sources/codeassembly-guidance/derive-session-context/derive-session-context.mjs` emits, and passing the paths that the ticket names.

2. **Assess relevancy**: Determine whether the ticket may be stale and, if so, verify it is still relevant.

**Override arguments take precedence:**

- If `--check-staleness` was passed: Run the relevancy check immediately, without prompting the user.
- If `--skip-staleness` was passed: Skip the relevancy check entirely.
- If neither was passed: Evaluate the heuristic below.

**Heuristic** (evaluated only when the task source is a remote ticket with a last-updated date):

1. Retrieve the ticket's last-updated date from the resolved metadata (e.g., GitHub's `updatedAt` field).
2. Count commits since that date: `git rev-list --count --after="{last-updated date}" HEAD`
3. If the ticket was updated within the last 3 days _or_ fewer than 5 commits have been made since the last update, skip the relevancy check.
4. Otherwise, prompt the user: "This ticket may be out of date ({N} commits since the last update on {date}). Would you like me to check for staleness and relevancy?" If the user declines, continue into Phase 2.

If the task source is plain text or a file (without remote metadata), skip the relevancy check unless `--check-staleness` was explicitly passed.

**The relevancy check** (when triggered by user approval or `--check-staleness`):

Invoke the `/assess-ticket` skill with the resolved ticket source and mode `drift`.

**After the check**: Interpret the drift verdict:

- 🟢 `none`: Continue silently into Phase 2.
- 🟠 `partial` or 🔴 `severe`: Present the assessment findings to the user. Ask whether to proceed as-is, adjust the scope, or stop.

### Phase 2: Understand the task

1. **Explore project context:** Check relevant files, docs, recent commits to understand the affected area of the codebase. Read the project's declared stage from the manifest's `project_maturity`, `project_sensitivity`, and `project_audience` fields, which `node ~/.claude/skills/_sources/codeassembly-guidance/derive-session-context/derive-session-context.mjs` emits.

2. **Evaluate the ticket on its merits**: Apply the criteria in [ticket evaluation](~/.claude/skills/_sources/codeassembly-guidance/_data/ticket-evaluation.md). When evaluation reveals a divergence from the ticket as written, recommend a disposition, build the design on it, and present the divergence at the ticket checkpoint; raise it earlier only when the design cannot proceed without the answer. Divergence includes scope that should grow: By default, fold work that the problem requires into this change rather than into a follow-up (see [scope-and-deferral](~/.claude/skills/_sources/codeassembly-guidance/_data/scope-and-deferral.md)).

3. **Form the questions that the design turns on, and decide what the gate lets you decide.** The questions cover purpose and motivation, constraints and scope boundaries, and success criteria and edge cases. Answer each from the codebase, the ticket, and the [option format](#option-format) gate when you can, and record the answer as a decision taken, with its reason. Defer the asks that survive the gate to the ticket checkpoint in Phase 3; ask earlier only when the design cannot proceed without the answer, and prefer multiple choice when you do. Treat the declared stage as the premise of every security, availability, and infrastructure question, per [project stage](~/.claude/skills/_sources/codeassembly-guidance/_data/project-stage.md). Treat a step that a person must run on each machine as a defect of the design, per [who applies the change](~/.claude/skills/_sources/codeassembly-guidance/_data/design-priorities.md#who-applies-the-change): Prefer a design that the agent applies and verifies itself, and when the step stays, the ticket's `## Proposed solution` names the rung of that ladder that shapes it. Ask for each undeclared stage value: in this step when the design has such a question, since the answer decides it, and otherwise at the ticket checkpoint. The ticket's `## Context` states each premise that decided such a question, and the plan includes a task that declares each answered value.
   - When asking option-style questions, follow [option format](#option-format). (Reinforces the rule in `AGENTS.md`: intentional redundancy.)

**Important:** Do not use `AskUserQuestion` or any interactive selector (pop-up, arrow-key, structured-choice) for multiple-choice questions. Ask the question as plain text in the message body, with options as a numbered list.

**Close the turn with an action-items block.** Before sending, sweep the draft for anything that invites a response: A soft offer ("let me know if", "say the word and I will", "worth knowing", "I can also") is an ask, and leaving it in the narrative is how asks get missed. Run a check that a command, a test, or a browser could settle rather than ask for it; a command for the developer to run is a handoff. Prose may discuss; only the block may ask. Move every ask into one labelled block at the end of the response, stated as the concrete action and punctuated as the question that it is. Do not add a block to a turn without an ask. When this skill defines its own canonical block for asks (a next-steps menu, an action menu, a finding-keyed question list), use that block: Add the ad-hoc ask to it, keeping the block's own identifiers, and never close a turn with two competing blocks.

Prefix with `A` an action that you propose to take (a "yes" makes you act) and with `Q` information or a judgment that you need (a "yes" only informs you). Number each so that the user can answer the whole block in one line. Leave a non-ask, such as a status note, in the prose without a prefix, and keep each prefix in agreement with its marker. Do not prefix the item of a single-item block.

```
---

**Action items**

**A1:** Add the packaging note to #977? 👍🏼👎🏼

**A2:** The fixture helper now has three call sites. Extract, or leave inline?

1. ■■□ Extract it into `test-utils/`:
   - ➕ the third call site copy-pasted a stale variant, which is how the leak got in
2. ■■□ Leave it inline until #981 settles the fixture format:
   - ➕ #981 changes every fixture's shape, so an extracted helper would be rewritten within the week

**Q1:** Which package owns the shared fixture once it moves? 🤔
```

When the block presents more than one independently-numbered list (a next-steps menu with two or more selects), put each list's identifier as a bold prefix on its header (`**A1: Remote issue**`) and keep each list's own 1-based numbering, so a bare numeral always names an option and `A1: 1, A2: 3` answers the block. A single-list block does not need that prefix.

### Phase 3: Converge on a design and refine the ticket

1. **Choose the approach.** When the solution is obvious, build on it; don't manufacture alternatives for the sake of it. When it is not obvious, weigh 2-3 approaches, ranked per [design priorities](~/.claude/skills/_sources/codeassembly-guidance/_data/design-priorities.md), in which a design that needs a person to act on each machine ranks below one that the agent applies itself, and apply the gate: A fork whose two strongest options are both ■■□ is presented at the checkpoint below with its trade-offs; otherwise the draft records the choice as "X, not Y" with its reason.
   - When asking option-style questions, follow [option format](#option-format). (Reinforces the rule in `AGENTS.md`: intentional redundancy.)

2. **Draft the ticket on the recommended approach, provisionally.** The design is the draft ticket: Its `## Proposed solution` states the design, scaled to complexity, and a fork that survived the gate is written on its recommended branch until the checkpoint settles it.

**Spike mode.** If this is a spike, use the spike ticket template in [spike conventions](~/.claude/skills/_sources/codeassembly-guidance/_data/spike-conventions.md) in place of the skeleton below; everything else in this phase is unchanged.

If the source ticket already covers problem, context, proposed solution, and acceptance criteria adequately and the design did not reveal any changes, propose adopting it as-is at the checkpoint. Skip the rewrite. Only add or revise sections for which the design revealed gaps or shifts in understanding.

When the ticket needs work, produce or update it to state the proposed approach:

```markdown
# {Title}

## Problem

{Clear statement of what needs to be solved and why}

## Context

{Relevant background, constraints, prior art, related systems}

## Proposed solution

{The shape of the proposed approach: components or boundaries involved, how it fits into the existing system, and the chosen approach, including "X, not Y" when a rejected option is worth recording. Keep this section outcome-shaped per the placement doctrine below.}

## Acceptance criteria

Include only the tiers that have criteria. Omit any empty tier; do not emit a "Should have" or "Nice to have" header with nothing under it.

### Must have

- [ ] {Critical requirement}

### Should have

- [ ] {Important but not blocking}

### Nice to have

- [ ] {Optional enhancement}
```

Start from this skeleton. Add a section only when it adds signal on which the reader must act.

- **Problem** and **Acceptance criteria (Must have)**: Always present.
- **Context**, **Proposed solution** (including "X, not Y"), and **Should have / Nice to have**: Opt-in, added only when the reader needs them. Omit empty tiers.

This applies the [concision principle](~/.claude/skills/_sources/codeassembly-guidance/_data/concision.md) to tickets.

**Write the tightened ticket, not a draft to be tightened later.** A ticket is the minimal contract that a reader needs, not a transcript of the design session. Compose the maximally tight version that still keeps the full meaning; length comes from content, not from a completeness instinct. (Producing the tight version up front spares the reader, and spares everyone the tighten-on-request round trip.)

State conclusions, not the journey to them. Naming a chosen approach (including "X, not Y") is a durable decision and belongs in the ticket. The _story_ of how the decision was reached does not: Drop the design back-and-forth, the false starts, restated context, and motivating episodes.

**Self-check before presenting.** For each sentence, ask: Would removing it change what the reader does or how the work gets executed? If not, cut it. State each acceptance criterion once, and do not restate it in surrounding prose.

Add a design-narrative section (rationale, alternatives explored) only when the user explicitly asks for it.

**Before** (the design journey is left in):

> We first considered extending the existing `FooAdapter`, but a spike showed it couples the cache to the transport, so after some back-and-forth we landed on a separate `CacheLayer`. The team has struggled with cache invalidation before, and this should finally fix that. Acceptance: A new `CacheLayer` module exists. It must be covered by tests so we know it works.

**After** (conclusion only, full meaning intact):

> Add a `CacheLayer` separate from the transport (not an extension of `FooAdapter`, which would couple cache to transport).
>
> - [ ] `CacheLayer` is independent of the transport.
> - [ ] New behavior is covered by tests.

**Place ticket content by kind, not by volume.** A ticket states the change's _subject_ and the _outcomes_ that it must produce; the _mechanism_ that achieves them belongs with the implementation, not the ticket. This is a separate axis from concision: A perfectly short ticket can still contain the wrong _kind_ of content.

- **Ticket**: The change's **subject** (the defect being fixed, the current structure being changed, the target contract or behavior that it exposes) and **key** non-obvious details that save the implementer real derivation (e.g. "reuse the sibling table's `getSortValue`").
- **Implementation**: The **mechanism**, meaning internal wiring, files as a diff-list, step sequences, deletion lists, and the internal props/config of a dependency consumed by the change.

The line is subject vs. mechanism, not code vs. prose: A code name is fine when it _is_ the subject. **Bug and refactoring tickets** name existing code because that code is the subject. Keep it; the fix procedure still belongs with the implementation.

**Before** (a feature ticket transcribing a reference implementation's API surface):

> Set `columnDefs`, pass `getSortedRowModel`, and wire `state.sorting`; pin the first column via `columnPinning.left: ['name']`; mock `@acme/table` in `__mocks__/@acme/table/compiled.tsx`.

**After** (the same change stated as the contract that it must honor):

> Every column sorts client-side, and the first column stays pinned during horizontal scroll. (Which props wire this up is implementation.)

Here, _the implementation_ is the plan artifact (Phase 4): Mechanism that the ticket omits is recorded there, not dropped.

**Test criterion convention:** When writing a ticket that changes testable behavior, include a test criterion in its acceptance criteria that asks for coverage at the cheapest tier that observes the behavior, per the placement rules in the `testing-conventions` skill (e.g., "New/modified behavior in this change is covered by tests at the cheapest tier that observes it"). Omit it when the change falls entirely within the carve-outs defined in the `testing-conventions` skill, or when the only tests that it would require are ones that fail that skill's bar for earning a place.

**Documentation criterion convention:** When writing a ticket that adds, removes, or renames user-facing surface (CLI flags, commands, API endpoints, configuration keys, environment variables), include in its acceptance criteria the corresponding updates to documentation, help text, and usage examples, including removal of references to anything that no longer exists.

**Umbrella criterion convention:** When writing an umbrella ticket, whose children do the work, list "Every child is closed" as an acceptance criterion alongside any requirement of its own, so that what completes it is stated rather than inferred. When the split is decided, create a child for every planned piece, so that the criterion cannot hold while a planned piece remains: Link each child to the umbrella as a sub-issue, and through blocked-by relations to the pieces that must be merged before it. Specify the current piece fully, and keep each later piece short: its outcome, a few must-have criteria, and a note that it is refined when its work starts. Never leave a planned piece as an outline in the umbrella's body. To defer a planned piece, close its child as not planned.

**Data-change criterion convention:** When writing a ticket that changes the shape of persisted data or writes to shared state, consult /consult-shared-data-conventions. Scope the ticket to one step of the expand, migrate, contract sequence, and include a criterion that deployed code keeps working whichever happens first, the deploy or the migration. When the ticket adds or changes a skill that writes to shared state, include a criterion that the skill runs against the real data before merge and stops before the write, and when a verdict from an agent decides that write, a criterion that a script checks the verdict's evidence before the write.

**No hard line breaks.** Write each paragraph and each list item as a single line. Do not insert newlines to wrap at a column width. Every surface that renders this text wraps it, and GitHub turns a newline inside a paragraph into a literal line break, so hand-wrapped prose renders ragged.

This rule applies to text composed for a rendering surface: a commit body, a PR or issue body, a comment, a saved artifact. Inside the repository, the project's formatter decides instead; if the project has none, follow the convention already in the file.

**Present the ticket as the first checkpoint**, in one turn: the draft ticket, the decisions taken so far with their reasons, and the forks that survived the gate as option-style questions. Revise until approved. Approval of the ticket is approval of the design.

**When the checkpoint splits the ticket**, the session continues with one piece: With two pieces, it plans the originating ticket, which keeps the first piece; with an umbrella, it plans the first child, whose work belongs in that child's own worktree. Phase 5 then ends with the launch prompts that [Splitting the ticket](#splitting-the-ticket) defines, with each ticket's entry point chosen by that section's **Report.** rule, and the planned piece's prompt names its saved plan. With two pieces, the next-steps menu stays for the originating ticket, and that ticket's prompt heading adds that this session continues with it at the menu. With an umbrella, the launch prompts replace the `Next action` menu, so that nothing offers to implement a child in the current worktree.

### Phase 4: Generate implementation plan

<HARD-GATE>
Do NOT start this phase until the ticket from Phase 3 has been explicitly approved.
</HARD-GATE>

Produce a plan that gives a competent coder everything they need, and enough context to adapt when the codebase doesn't match expectations.

> Phase 4 produces the same implementation plan as the standalone `plan` skill, drawn from one shared template. When a ticket is already good and only the plan is needed, run `plan` directly to skip the design phase.

**Spike mode.** If this is a spike, use the spike plan template in [spike conventions](~/.claude/skills/_sources/codeassembly-guidance/_data/spike-conventions.md) in place of the template below; everything else in this phase is unchanged.

**Detail threshold:** Include enough detail that a competent engineer, reading only the plan and ticket, would make the same architectural decisions you would. Omit details that they'd arrive at independently. Compose at this altitude from the outset ([concision principle](~/.claude/skills/_sources/codeassembly-guidance/_data/concision.md)); a plan drafted tight beats a fuller one pared down.

```markdown
# Implementation plan: {Title}

## Context

{Brief context linking this plan to the ticket}

## Approach

{High-level strategy, 2-3 sentences}

## Decisions taken

- {🔲 while it awaits the checkpoint} {A decision that the agent took without asking, with its one-line reason}

## Tasks

### Task 1: {Name}

**Files:**

- Create: `path/to/new-file.ts`
- Modify: `path/to/existing.ts`
- Test: `path/to/test.ts`

**What:** {What this task accomplishes and why}

**Key decisions:**

- {Design choice that the coder needs to know}

**Acceptance criteria:**

- {How to know this task is done}

### Task 2: {Name}

...

## Risks

{Known risks, unknowns, or areas where the coder may need to adapt}

## Verification

{The checks that the agent runs to verify the whole plan is complete: quality gates, integration checks}
```

`## Dependencies` (external dependencies or blockers) is the one optional section: Insert it between `## Risks` and `## Verification` only when the plan has external blockers, and omit it otherwise.

**Per-task test criterion:** When a task creates or modifies testable behavior, its acceptance criteria must include a test criterion that asks for coverage at the cheapest tier that observes the behavior, per the placement rules in the `testing-conventions` skill (e.g., "New/modified behavior is covered by tests at the cheapest tier that observes it"). Omit it when the change falls entirely within the carve-outs defined in the `testing-conventions` skill, or when the only tests that it would require are ones that fail that skill's bar for earning a place.

**Per-task documentation criterion:** When a task adds, removes, or renames user-facing surface (CLI flags, commands, API endpoints, configuration keys, environment variables), its acceptance criteria must include updating documentation, help text, and usage examples, including removal of references to anything that no longer exists.

**Per-task README guidance:** When a task writes or revises a README, consult /consult-readme-conventions while planning the task. Its key decisions name the rulebook, the table row that fits the README, and what that row says the README leads with, keeps, and omits, so that the constraints are available to an implementer that cannot load the rulebook.

**Per-task documentation placement:** When a task writes or revises guidance or documentation, its key decisions name the source that defines each fact that the task documents, and the task writes a pointer to that source rather than a copy, per the "Documentation placement" section of the shared agent instructions.

**Per-task interface guidance:** When a task defines colour tokens, styles or writes interface text, or builds a page, a prototype, or a UI component, consult /consult-accessibility-conventions and /consult-ui-copy-conventions while planning the task. Its key decisions state the contrast and size floors and the contrast check, the interaction states that each interactive element shows, and the copy rules and the copy budget, so that the constraints are available to an implementer that cannot load the rulebooks. When the plan changes a visible component, its `## Verification` includes the rulebook's browser check of each new or changed interactive element.

**Data-change guidance:** When the work changes the shape of persisted data or writes to shared state, consult /consult-shared-data-conventions while planning. Scope the plan to one step of the expand, migrate, contract sequence, and name that step in the key decisions of each task that touches the data. A task or verification check does not run a migration or another write against shared state before merge. When a verdict from an agent decides such a write, the acceptance criteria of the task that implements the verdict name the evidence and the script that checks it before the write. When the work adds or changes a skill that writes to shared state, `## Verification` runs the skill against the real data up to its approval checkpoint or as a dry run, and reviews each verdict that the run would act on.

**Per-task invoked-skill guidance:** When a task invokes a skill, read that skill while planning the task and record in the task's key decisions what the skill declares under three headings: its ordering relative to other skills, its default target when the task does not pass an argument, and the preconditions that it states. Read every skill that the plan's tasks name, and record a skill declaring none of the three as declaring none, so that a reader can tell a completed check from an absent one. A skill that cannot be read is recorded as unread, never as declaring none. When an ordering constraint names a skill that the plan's tasks do not invoke, add the task rather than record the constraint alone.

**Who performs a step.** Every task and every `## Verification` check names the agent as its actor. A part that only the developer can perform is written as a `**Residue:**` line under the task, after **What:** and in the same position as **Key decisions:**, in the form "**Residue:** {what the developer alone can do}: {why the agent cannot}", and the task's other parts stay the agent's. A residue that a person must perform on each machine is one script per machine, run once, which checks its own result and prints only the facts that the agent needs; the agent writes and commits the script. A record of the work, such as a log entry or a ticket comment, is never residue, and the residue is never shipped as documentation for a person to follow. Check a resource's availability before naming it as a risk; when a step needs something that only the developer can supply, such as a credential or a running service, the step states the ask for that resource, never a degraded fallback and never the step as the developer's. A manual check is cut when an automated test or a check in `## Verification` asserts the same observable outcome, and stays, as the agent's, when it would show something that the tests do not assert. A check proposed against a deployed branch accounts for a `live` worktree, which runs the merged tree rather than the branch.

Before (a verification task handed to the developer):

> **What:** After the branch is pushed and Vercel builds the preview, the owner exercises `/lab/book-row` by keyboard and on a touch device against the checklist in Task 9. Defects found there are fixed on the branch. Once the owner confirms, delete the lab route in its own commit.
>
> **Acceptance criteria:** The owner has confirmed the controls on the preview.

After (the agent runs the check, and the residue is the one part that emulation cannot show):

> **What:** Drive `/lab/book-row` through the debug browser with keyboard input and touch emulation against the checklist in Task 9, fix what the check finds on the branch, then delete the lab route in its own commit.
>
> **Residue:** How the rating control feels on a physical phone: emulation does not report touch feel.
>
> **Acceptance criteria:** Every item of the checklist passes in the debug browser, and the lab route is gone.

#### What belongs in the plan

- Task decomposition with ordering and dependencies
- File-level decisions (create, modify, test)
- Key decisions that state design choices
- The decisions ledger: every call that the agent took in place of an ask, its reason, and whether it is provisional
- Acceptance criteria per task
- Risks and unknowns

Code belongs in the plan only when it records a decision that isn't obvious from prose: for example, an interface that constrains how components interact, or an algorithm whose shape isn't implied by the description.

#### What does NOT belong in the plan

- Commit messages
- Shell commands (test runners, build commands)
- TDD step-by-step ceremony
- Implementation code for straightforward logic

Present the plan as the second checkpoint, with its `## Decisions taken` section and any ask that survived the gate since the ticket was approved. Revise until approved.

### Phase 5: Sweep for completeness, save artifacts, and stop

**Sweep the artifacts for anything the conversation settled that they do not record.** After the plan is approved or drafted, before the artifacts are saved, re-read them against the conversation and apply the handoff test: Could a competent developer, reading only the ticket and plan without access to this conversation, achieve the intended result and make the same decisions? Whatever fails that test is a gap.

This sweep is the completeness counterpart of the [concision](~/.claude/skills/_sources/codeassembly-guidance/_data/concision.md) self-check: That one asks what can be cut, this one asks what was never captured. They are a deliberate pair, not competing pressures. An artifact that drops a settled decision isn't concise, it's incomplete.

The handoff test has two halves, and each needs a different reader. The sweep checks that each settled decision is recorded, and it runs in the main session because only the session knows what the conversation settled. The handoff pass checks that the artifacts stand alone, and it runs in a subagent because only a reader without memory of the session can see a gap: The writer fills each one from memory without noticing the fill.

**Sweep for:**

- Settled decisions, including the rejected alternatives.
- Decisions that the agent took without asking: Every one is in the plan's `## Decisions taken` section, with its reason, marked 🔲 when it awaits this checkpoint.
- Constraints and scope boundaries on which the conversation agreed.
- Edge cases and success criteria raised in discussion but missing from the acceptance criteria.
- Tacit context of the form "the implementer might not realize X": What the conversation established as known and the artifacts leave the reader to rediscover.

**Place each gap by kind**, per the placement doctrine: Fold the change's subject and outcomes into the ticket and the mechanism into the plan. Where the gap came up in conversation does not decide where it goes. When the invocation does not produce a ticket artifact, fold a subject-level gap into the plan's context section.

**Classify the plan once the sweep's gaps are folded in.** Read the plan against the [complexity rubric](~/.claude/skills/_sources/codeassembly-guidance/_data/complexity-classification.md) inline, without dispatching `classify-complexity`; a spike plan is classified by its investigation steps. At level 1–2, skip the handoff pass: Report the skip in one line that names the level, and proceed to save. At level 3–4, run the pass. The rubric's tie rule applies, so a plan on the border gets the pass.

**Run the handoff pass at level 3–4.** Write the ticket and the plan as drafts to a scratch directory created with `mktemp -d "${TMPDIR:-/tmp}/handoff.XXXXXX"`, using the absolute path that the call prints; they are saved to the artifact directory only once, after this pass. When the invocation does not produce a ticket artifact, `ticket-source` is the ticket's URL or reference. Dispatch the `handoff-reviewer` subagent via the Task tool with this block:

```dispatch
ticket-source: {ticket draft path, or ticket URL or reference}
plan: {plan draft path}
root: {repository root}
```

The block contains scalars only, and only these keys. Do not compose any prose into it: A sentence written here gives the reader the session's knowledge, and the pass is worth nothing once the reader shares what the writer knows.

**A reply that lacks the `Phase: handoff-review` return block is a reviewer stopped by its turn limit.** Resume that reviewer once, asking only for its report; on Claude Code, send it a message with `SendMessage`, addressed by the agent ID that its dispatch returned. The resumption continues the same dispatch, so it is not the second dispatch that the pass forbids. When the harness cannot resume a subagent, or the resumed reviewer still does not return a report, do not dispatch again: Save the drafts without the pass, and report that the handoff pass did not return a report, even when the sweep found nothing.

**Fold in each item that the reader returns**, into the drafts: Place a missing fact by kind, per the paragraph above, and correct a claim that the repository contradicts. A question that the conversation settled is answered in the artifact. A question that the conversation never settled is asked of the user before saving, and the answer is folded in like any other item. Do not dispatch again after the fold-in: The pass runs once.

**Report and proceed.** When the sweep or the handoff pass finds gaps, fold them in, report the amendments as a brief list, then save the drafts as the artifacts. The report is informational: The amendments record what the conversation already settled or what the repository shows, so they do not open an approval gate, and the only ask that the sweep opens is a reader question that the conversation never settled. When neither pass finds anything, save silently; a clean sweep is not worth a line. The skip line is the one exception: A pass that was not run is a decision that the user should see.

Then save both artifacts:

1. Resolve artifact directory using `save-artifact` conventions:
   - Invoke `node ~/.claude/skills/_sources/codeassembly-guidance/derive-session-context/derive-session-context.mjs` via Bash to obtain `ticket_id`, `project_slug`, and `artifact_base_dir` from the manifest JSON emitted on stdout (auto-generate ticket ID as `{YYYYMMDD}-{4 random hex}` if none found)
   - Target: `{artifact_base_dir}/projects/{project_slug}/tickets/{ticket_id}/`
   - `mkdir -p` the target directory
   - After an umbrella split, save the plan in the planned child's directory instead, `tickets/{child_id}/`, beside the ticket artifact that `/create-ticket` saved there

2. Resolve frontmatter fields for both artifacts. The frontmatter conforms to the [universal artifact frontmatter](~/.claude/skills/_sources/codeassembly-guidance/_data/artifact-conventions.md#universal-artifact-frontmatter) schema.

   Run `~/.claude/scripts/resolve-frontmatter.sh --skill design-and-plan --interactive true` via Bash. Prepend the output verbatim to each artifact body. For a plan saved in a child's directory, append `--override ticket_id="{child_id}" --override ticket_ref="{child_ref}"` to the plan's invocation, so that its frontmatter names the child rather than the current branch's ticket.

   Append `--extra copies_remote=true` to the ticket artifact's invocation, and to that one alone, when the source was a remote ticket and the refined ticket does not differ from its body: the same condition under which the remote-issue offer below is not made. This records that the saved body is a copy of the ticket of record; see [ticket frontmatter](~/.claude/skills/_sources/codeassembly-guidance/_data/artifact-conventions.md#ticket-frontmatter). When the offer is made, omit it on both outcomes: On consent, the remote is written after the artifact is saved, so the remote is already the more recent copy, and a refusal leaves the snapshot genuinely newer.

3. Save both artifacts following `save-artifact` naming conventions:
   - Ticket: `{YYYYMMDD-HHMMSSZ}_{slug}_ticket.md`
   - Plan: `{YYYYMMDD-HHMMSSZ}_{slug}_plan.md`

   Prepend the resolved frontmatter to each artifact content before writing.

4. Report paths and present next steps. After a split at the ticket checkpoint, end with the launch prompts, per the checkpoint-split rule in Phase 3.

```
Design and plan complete:
  Ticket: {ticket_path}
  Plan:   {plan_path}
```

**Remote issue update**: Offer to update the remote issue only when the source was a remote ticket (URL or shorthand reference) and the refined ticket differs from the remote body. Phase 3 may adopt a good source ticket unchanged and the sweep may find nothing to fold in; the remote is then already current; do not make the offer. This is a shared-state action; do not update without explicit consent, and never open a turn of its own for the ask.

Render the offer inside the next-steps block as its own labelled sub-block above the options, under the same `Next steps:` header. With two selects present, each shows its `A`/`Q` identifier as a bold prefix (`**A1: Remote issue**`, `**A2: Next action**`) and keeps its own 1-based option numbering, so the user answers `A1: 1, A2: 3`. The consent is independent of the single-select next-step choice, and the next-action options keep their order. Recommend the update: The offer appears only when the remote body is stale against the refined ticket. The recommended option's marker follows how stark that staleness is (■■■ when the refined ticket plainly supersedes the remote body, ■■□ when the delta is real but arguable), and Leave as-is takes ■□□.

```
Next steps:

**A1: Remote issue**
1. 📝 ■■□ Update {ticket_ref} with the refined ticket
2. ⏭️ ■□□ Leave as-is

**A2: Next action**
1. 🧠 ■□□ Refine plan:
   - Clear context, then /refine-plan with plan: {plan_path}, ticket: {ticket_path}
...
```

On consent, write the refined ticket per [platform-specific write](~/.claude/skills/_sources/codeassembly-guidance/_data/ticket-source-resolution.md#platform-specific-write). The refined ticket is the whole body approved by the user, so it replaces the remote body outright.

<HARD-GATE>
Follow the options, output format, and recommendation rules in [next-steps options](#next-steps-options) exactly. Do not improvise the options. The `**A1: Remote issue**` and `**A2: Next action**` sub-block labels above are the sanctioned wrapper when the remote offer is shown; they do not add or reorder any option. After an umbrella split at the ticket checkpoint, the launch prompts take the place of the `Next action` menu, per the checkpoint-split rule in Phase 3. The plan was developed interactively, with the ticket and the plan each approved at a checkpoint; use this as recommendation context. Include both `{ticket_path}` and `{plan_path}` in each skill-invoking option line.
</HARD-GATE>

**STOP.** Beyond the remote-issue update above, do not invoke any skill. Do not begin implementation.

## Key principles

- **Batch asks at checkpoints**: Decide what the gate lets you decide, record it, and collect the surviving asks into the ticket checkpoint and the plan checkpoint
- **Multiple choice preferred**: Easier to answer when possible
- **YAGNI ruthlessly**: Cut unnecessary scope from designs
- **Scale to complexity**: A simple task gets a short design and a short plan
- **Plan for engineers, not transcribers**: Communicate decisions, not ceremony
- **The ticket is the contract**: If the facts found during implementation differ from the plan, the ticket's acceptance criteria are the source of truth

## Next-steps options

### Options

| #   | Emoji | Option           | Description                                                     |
| --- | ----- | ---------------- | --------------------------------------------------------------- |
| 1   | 🧠    | Refine plan      | Review the plan for completeness and correctness                |
| 2   | ✂️    | Split the ticket | Cut the plan at a seam into tickets that each ship on their own |
| 3   | 🚀    | Implement        | Work the plan's tasks, then choose a review pass                |

### Output format

Present all three options as a numbered list per [option format](#option-format). Each option has a strength marker (■■■/■■□/■□□/□□□); the recommendation rules below determine which option takes the strongest marker. Pros and cons are omitted by default; add a `➕` or `➖` line only when the specific plan presents a tradeoff that survives the option-format tests bearing on which option fits (e.g., "the schema change ships and is verifiable before the reader that consumes it," "every task follows the sibling table's established pattern"). Generic option properties ("structured review pass," "longer wall time") are noise and must be omitted. Include all known paths (plan, ticket) in each option line; omit paths that are not available in the current context. Use `~/`-relative paths when possible and absolute paths otherwise. Every line subordinate to an option (invocation guidance as much as a pro or con) is a nested list item, never a whitespace-indented continuation.

**The ticket and plan are the complete handoff.** Every option assumes that a fresh session acts on the saved artifacts alone, whether or not one does, so nothing that only this session knows distinguishes one option from another. A pro or con never cites the conversation, session-held context, or what is "already in context", and neither does the invocation guidance of any option, the spike's 🔬 Investigate included. When a fact that an option needs exists only in the session, the artifact is incomplete: Add the fact to the ticket or the plan before rendering the menu, rather than citing the session.

**One `➕` line is mandatory rather than omitted.** When Refine plan is the selected option, it must include a `➕` line naming the specific unsettled decision that the pass would raise (rule 1). The line names an open decision, never a reassurance about work already done: "a refine pass is the cheap way to find out whether I missed something" is the shape that this requirement exists to forbid. When Split the ticket is the selected option, it must include a `➕` line naming the plan's size and the pieces (rule 2). Selecting either without its line is a defect: If the line cannot be written, the rule did not match and the cascade continues.

**Spike plans.** A spike plan has `## Investigation steps` rather than `## Tasks` (see [spike conventions](~/.claude/skills/_sources/codeassembly-guidance/_data/spike-conventions.md)). It is carried out to produce findings rather than implemented to produce a diff, and `implement-plan` reads only the feature shape. Render option 3 as 🔬 Investigate, without invoking a skill; the agent works the investigation steps directly and ends the run with the plan's `## Deliverable`, which includes offering the [closing post](~/.claude/skills/_sources/codeassembly-guidance/_data/spike-conventions.md#closing-post) on the ticket and making it on consent. Option 1 renders unchanged. Option 2 renders at □□□ with the `➖` that a spike produces findings rather than pieces that ship. In the recommendation rules below, rule 2 never matches on a spike plan, so Investigate is the fallthrough whenever rule 1 does not match.

Options that invoke a skill include context-clearing guidance:

- **Refine plan**: Prepend "Clear context, then..." because the plan artifact is self-contained; prior conversation wastes tokens and can introduce bias.
- **Split the ticket**: No "Clear context" prefix, and no pasted invocation line; the split runs in this session because the library doesn't have a skill for it, and it cuts the pieces from the saved plan. See [Splitting the ticket](#splitting-the-ticket).
- **Implement**: No "Clear context" prefix. The ticket and plan are self-contained, so `implement-plan` works the same in this session or in a fresh one, and clearing gains nothing: Unlike a refine or review pass, implementation is not harmed by sharing the planner's view. The user can also paste the same line into a fresh session, or into the other harness with its own skill sigil, in which the skill re-resolves the plan and ticket from the environment.

Example (rendered for the default case, in which the recommendation rules below select Implement):

```
Next steps:
1. 🧠 ■□□ Refine plan:
   - Clear context, then /refine-plan with plan: {plan_path}, ticket: {ticket_source}
2. ✂️ ■□□ Split the ticket:
   - Selection runs the split in this session
3. 🚀 ■■□ Implement:
   - /implement-plan with plan: {plan_path}, ticket: {ticket_source}
```

Skill names for each option:

- 🧠 **Refine plan** -> `refine-plan`
- ✂️ **Split the ticket** -> `/create-ticket`, once per piece, in this session
- 🚀 **Implement** -> `implement-plan`; on a spike plan the option is 🔬 **Investigate** and does not invoke a skill

### Recommendation rules

Select the recommended option by checking these rules in order and stopping at the first match.

1. **Refine plan**: Recommend only when you can name a load-bearing decision that the plan leaves unsettled and that a refine pass would raise.

   A decision is **unsettled** when the plan invented it and nothing has challenged it. It is **settled** when it was ratified interactively, taken from prior design work, verified against source, or copied from an established pattern already in the codebase. A `## Decisions taken` entry that survived an approval checkpoint is ratified: The developer read it and did not overrule it. The calling skill's recommendation context tells you which: A plan whose forks were challenged and ratified interactively has settled decisions, and a plan produced without a design phase is likelier to have unsettled ones.

   Rule 1 also fails when the plan's residual unknowns are **empirical**, answered by running code or writing the test. A refine pass re-reads the plan and structurally cannot answer those. Only **analytical** residue, resolvable by a closer reading, counts.

   "The plan might have a flaw I missed" does not satisfy the test. That is a reassurance about work already done, not an unsettled decision.

   The following make a plan _more likely_ to have an unsettled decision. They are evidence to weigh, and none of them matches rule 1 on its own:
   - Changes to dependency boundaries (which libraries are used, which APIs are consumed, or how they're configured)
   - Changes to the shape or semantics of behavioral contracts or data structures
   - Far-reaching downstream consequences
   - Changes to control flow, state management, or execution order
   - Introduction of new interfaces, modules, or subsystems
   - A prior `refine-plan` round significantly altered the plan or expanded the scope of the changes needed to implement it

   When rule 1 matches, the rendered option must name that decision on a `➕` line. Being unable to write the line means rule 1 did not match.

2. **Split the ticket**: Recommend only when the plan is too large for one implement-and-review pass, and it contains two or more pieces that can each be merged and verified on their own. Both halves are required: Too large without a seam is not a match, and a seam in a plan that one pass would cover is not one either.

   A piece gets its own ticket when it can be merged and verified on its own, not when it looks large enough to deserve one. The `➕` line names the size and the pieces, each with the tasks that it takes: `➕ eleven tasks across three packages, and two pieces ship on their own: the schema change (tasks 1–4), then the reader that consumes it (tasks 5–11)`.

   Structural properties (new module boundaries, changed interfaces, several packages) make a plan _more likely_ to be too large. They are evidence to weigh, and none of them matches rule 2 on its own.

   When rule 2 matches, the rendered option must name the size and the pieces on a `➕` line. Being unable to write the line means rule 2 did not match.

3. **Implement**: All other cases (default), whatever the number of modules or packages that the plan touches. `implement-plan`'s closing menu re-decides the review depth from the realized diff, and it offers a split when the diff proves too large for one review pass, so a plan sent here is not committed to a single pull request.

   When the work is trivial enough that a review pass would catch nothing meaningful ([complexity levels 1–2](~/.claude/skills/_sources/codeassembly-guidance/_data/complexity-classification.md): a typo fix, an unused-import removal, a single-file mechanical rename), add a `➕` line noting that the follow-up review can be skipped at `implement-plan`'s closing menu. Because that menu decides the review from the diff that the implementation actually produced, a plan-time triviality read is a hint to it rather than a commitment.

#### Marker strengths

The selected option's marker follows how cleanly its rule matched: ■■■ when the rule's test is met squarely and the alternatives are worse on the criteria that decided it, ■■□ when the fit is good but an alternative stays defensible, ■□□ when little separates the options. Because rule 3 is the cascade's fallthrough rather than a positive match, its marker follows how squarely rules 1 and 2 failed: ■■■ when neither came close, ■■□ when one stayed defensible. The unselected options take ■□□ by default, and □□□ when one has a clear drawback in the current context.

Each skill supplies its own recommendation context (e.g., whether the plan was developed interactively, whether a review just completed). That context applies to rule 1's settled/unsettled test.

#### Splitting the ticket

Selecting Split is the developer's consent to the split at the seam that its `➕` line names. Nothing is created before that selection, and the bodies get one confirmation before anything is created.

**Compose.** Compose a ticket body per piece (problem, context, acceptance criteria) from the piece's work and the ticket's criteria. Compose the originating ticket's new body as well: With two pieces, rewrite it to the first piece, so that the originating ticket and one new ticket cover the two pieces; with three or more, make it an umbrella that keeps its problem and context, lists the children, and has "Every child is closed" as its acceptance criterion. When the work does not have a governing ticket, every piece is a new ticket and there is nothing to rewrite.

**Confirm once.** Show every body, every relationship, and everything that the steps below create or change in one block, and confirm once. This single confirmation stands in for the per-ticket confirmation that `/create-ticket` would otherwise raise for each piece.

**Cut the plans.** Cut a plan per piece from the approved plan, so that each piece's session can start at Implement. Keep each piece's plan in context when its ticket is created, so that `/create-ticket` saves the plan beside the ticket artifact and posts it on the ticket.

**Create the tickets.** Create the pieces in order with `/create-ticket`. With three or more pieces, pass `--parent` naming the originating ticket. For a piece that depends on an earlier piece being merged first, pass `--blocked-by` naming that piece's reference, which exists by then.

**Rewrite the originating ticket.** Write the originating ticket's new body per the platform-specific write in [ticket source resolution](~/.claude/skills/_sources/codeassembly-guidance/_data/ticket-source-resolution.md#platform-specific-write).

**Save the first piece's plan.** With two pieces, save the first piece's plan in the originating ticket's directory per `/save-artifact`. Its timestamp is later than the approved plan's, so `implement-plan` resolves it rather than the unsplit plan.

**Report.** Report the ticket references and the plan paths. Choose each ticket's entry point from what its artifacts settle: `/design-and-plan` when the piece's design needs a closer look; `/plan` when the ticket is ready but does not have a plan; `/refine-plan` when its plan leaves a decision unsettled, by the test in rule 1 above; `/implement-plan` otherwise, which is the default for a plan cut from an approved one.

**Launch prompts.** Present one launch prompt for each ticket that keeps work, ready to paste into a fresh session: With two pieces, the originating ticket gets one; an umbrella does not get one. Order the prompts by work order: A ticket comes after every ticket that blocks it, and otherwise in the order in which it was created. Render each prompt as a bold heading line, `**{ticket_ref}: {title}** (ready now)` or `(after {blocker_ref} merges)`, followed by a fenced block that contains only the text to paste:

- The entry invocation, which the rule above chooses, as `{entry_skill} with plan: {plan_path}, ticket: {ticket_ref}`, adding any flag that the rule names, and omitting the plan when the ticket does not have one.
- The scope notes that the session needs and that the artifacts do not state, such as "only tasks 2 and 3" or "merge only after `live` contains #N".
- The ticket's blockers, by reference.

See [`scope-and-deferral.md`](~/.claude/skills/_sources/codeassembly-guidance/_data/scope-and-deferral.md) for the related decision on whether a finding warrants its own ticket. That decision (do now / batch later / separate ticket) is about work that comes up alongside the plan; rule 2 is about the plan's own work, and its seam test comes from the ticketing preferences: A piece gets its own ticket when it can be merged and verified on its own.

## Option format

**Confirm that the menu is needed before rendering it.** Mark the options first, check the leader as "Check the leader before rendering" below states, then read the markers: Render the menu only when the two strongest options are both ■■□, when the list is unmarked, or when the decision is in the gated class below. Decide every other field: State the decision in one line with its reason, record it, and proceed. Decide an all-■□□ field too. An unmarked list is a pure-preference call, and a preference is in the gated class. The rejected alternative belongs in a clause ("X rather than Y, because Z"), never as a numbered option awaiting selection.

A determination that has one right answer under a governing document, such as a change's work type under the work-type test, is not a fork. Resolve doubt about which answer the test yields by applying the test and picking: Two options marked ■■□ are a fork between acceptable options, not doubt about a fact. The developer holds less of the evidence than the agent, so handing the doubt back produces a worse-informed answer.

The gated class is closed. Ask about these decisions whatever the markers say:

- the shape of a public API or a contract
- remote shared state: a ticket edit, a push, a merge, the creation of a branch or a ticket
- data loss, or any action that cannot be undone
- spend or budget
- a preference for which you do not hold any evidence

Decide everything else yourself by default. Never decide a gated action in your own voice: The developer authorizes it; recommend, build on the recommendation provisionally, and ask at the checkpoint. Building on it means doing the work that depends on the answer; hold the gated action itself until the developer authorizes it. A templated next-steps menu is in the class, because what to do next is a preference about the developer's time, for which you do not hold any evidence. Verification is never in the gated class: Run a check that a command, a test, or a browser could settle.

**Proceed provisionally.** Do everything that does not depend on an answer first, and raise an ask only when the work is blocked or at the skill's checkpoint. When a gated decision has a strong recommendation, build on it, mark it 🔲 as "Record what you did not ask" states, and ask at the checkpoint; revise if overruled. In a skill without a phase structure, treat the skill's own approval gate, or the end of its work, as the checkpoint.

**Batch, never stream.** Collect the asks that survive the gate into one review at the checkpoint, not one per turn.

**Record what you did not ask.** Write every decision that the gate let you take into the plan's `## Decisions taken` section, with a one-line reason; when the work does not have a plan, write it into the turn's summary. Always record: A silent decision is worse than an ask. Start each line that states a decision awaiting the checkpoint with 🔲, wherever you state it: in the record, and in a turn's narrative, such as a checkpoint summary or a list of decisions. The marker lets the developer find what they may overrule without reading every line. Drop it once the developer approves the checkpoint at which the decision was presented.

**Never rank the options by your own elapsed time, round trips, or effort.** You measure these costs yourself, and that measure counts the user's context switch and review cycles as nothing. Measuring one does not make the call yours, and a more accurate measurement still cannot rank the options.

Ordering follows from the gate. When the order changes the code or the total effort -- upstream before downstream, a refactor before the feature that would otherwise be written twice -- recommend it and mark it, naming the delay that it causes and saying nothing about delay when none is involved. When the outcomes are identical and only the timing differs, such as when queued work is picked up, present the cost, render the options unmarked, and put the choice at the checkpoint.

Asking is not neutral. It costs the developer a context switch, and it idles the session until the answer arrives. A wrong-but-stated recommendation costs them a word to correct; a decision handed back costs them an evaluation and costs the session the wait.

Render every option-style question in this form: any numbered list of 2 or more choices with substantive tradeoffs, including templated next-steps menus and yes/no choices in which both paths are concrete actions. Reserve `👍🏼👎🏼` for confirmation prompts, in which a single action has been proposed and "no" means "let's adjust or discuss" rather than a concrete alternative.

**Number every option**: `1.`, `2.`, `3.` The number is how the user selects. Never render the options as bullets or bare prose.

**Mark every option with a strength marker.** The recommended option is the one with the strongest marker. Do not write a separate "I recommend option N" sentence, and a recommendation that does not match the strongest marker is a defect.

| Marker | Label                | When to use                                                                                                                                   |
| ------ | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| ■■■    | strongly recommended | One option is clearly better on the criteria governing the decision, and your ranking does not turn on a preference that only the user holds. |
| ■■□    | recommended          | Your lean. Default level when you have a preference.                                                                                          |
| ■□□    | weakly recommended   | A slight edge; mostly preference.                                                                                                             |
| □□□    | not recommended      | Clear drawbacks; included for completeness or to rule out explicitly.                                                                         |

Marking is all-or-none: Once any option has a marker, give every option one. Without a preference (a pure taste call), omit markers from every option and don't explain the omission; the absence is the signal. Mark at the strength that you actually hold: A marker that reads the same whatever the analysis found does not convey any information, and the reader must do all the work of telling a real choice from a formality. Render markers as plain text, never inside backticks; backticks shrink the glyphs and hurt readability.

**Format each option** as marker, then title, then a colon. Make each pro (`➕`) and con (`➖`) a nested list item beneath its option, without terminal punctuation. Apply this even when an option has only one pro or con. Lead with the strongest argument.

Make every line subordinate to an option (a pro, a con, invocation guidance) a nested list item, never a whitespace-indented continuation. Indentation by spaces, ASCII or non-breaking alike, does not survive terminal rendering: The lines collapse to the left margin, and the reader cannot tell which reason belongs to which option. Markdown structure survives; whitespace does not.

Stop nesting at one level: Never put a sub-option in an option or a sub-pro in a pro. Terminal rendering stops being reliable at deeper nesting, so this contract is written never to need it.

**Write only bullets that are real.** Bullets report the weight of each option, not a balance between the options: When the options differ in quality, an uneven menu is the accurate one, and a menu that looks balanced misreports the analysis. A `➕` or `➖` asserts that the reader should weigh it, and bullets render at equal visual weight. A manufactured one reads exactly like a load-bearing one, and it takes a round trip to discover that it was empty. Seven tests:

- **Falsifiability.** A `➖` must be false for at least one other option on the menu, and a `➕` likewise. Anything that would still be true if this were the only option is a mechanic of carrying it out rather than a tradeoff; it belongs on the invocation line or nowhere.
- **Decision weight.** Would a reader who believed this bullet choose differently? Bookkeeping, mechanically-implied, and trivially-reversible consequences (a doc line to update, a criterion to reword, a rename to propagate) are real, specific, and decision-irrelevant. Restatements of an option's inherent properties ("longer wall time", "structured review pass", "ships faster") are one instance of the same failure.
- **Session context.** Cut a bullet that cites the conversation, what the session holds, or what is "already in context". Every handoff goes through a saved artifact, so session context does not distinguish one option from another, and a bullet that rests on it tells the reader that the artifact is incomplete. When the bullet is true, the artifact has a gap: Add the fact to the artifact rather than citing the session.
- **Consequence.** State in a `➖` what breaks or what it costs, and for whom, concretely enough that the reader can weigh it without investigating. Cut a con that cannot be stated that way.
- **The qualifier tell.** A bullet undercut by its own qualifier ("negligible", "inert", "harmless") is filler. The only repair is to cut the bullet: Deleting the qualifier leaves the same minor con, now looking weighty.
- **One tradeoff, stated once.** When one option's `➕` restates another option's `➖`, the two options are the sides of one tradeoff. State it once, in a line above the list, rather than as bullets split between the options, which the reader counts as separate reasons.
- **Check before you hedge.** If a cheap check would settle whether a con is real, run the check. Presenting the uncertainty as a bullet transfers the check to the user.

Asymmetry is a report, not a defect. Give an option that has three real pros but lacks a real con its three pros, and do not give it a con. Never add a bullet to fill a slot, reach parity between options, or avoid looking one-sided; when the honest cost is hard to find, that difficulty is itself evidence the option is strong. When every option lacks a real bullet, omit them all and let the markers alone convey the recommendation. Do not add tiebreaker text for equal-strength options; the developer picks the number.

Keep on a `□□□` option the `➖` that explains why you ruled it out. Under the falsifiability test that bullet is real by construction, and without it the reader is left with a veto that they cannot check.

**Check the leader before rendering.** Once you have drafted the bullets, and before you read the markers against the gate, run this check. It applies to a gated decision as fully as to any other: The menu renders whatever the markers say, and the marker tells the developer how much deliberation the ask needs.

1. For each alternative, look for a cost that disqualifies it, including one that follows from the constraints and acceptance criteria of the work at hand. When you find one, state it as the alternative's `➖`.
2. For each `➖` on the strongest-marked option, name the reader who would choose differently because of it. Cut the bullet if there is none.
3. Re-mark the options. When every alternative has a disqualifying `➖`, mark the leader ■■■. The observed bias is a marker set too weak, not one set too strong.
4. Re-apply the gate. Outside the gated class, a leader marked above every other option means that the field is decided: State the decision in one line, and do not render a menu. Inside the class, render the menu with the leader's marker as the check set it.

**Identify each question** when a single response contains 2 or more option-style questions: Prefix them `Q1`, `Q2`, and so on, so that the user can reference answers unambiguously. When the underlying data already has stable identifiers (plan-review findings such as `C1` or `X2`), use those in place of `Q1`/`Q2`. For a single option-style question, omit the identifier. Inside an [action-items block](~/.claude/skills/_sources/codeassembly-guidance/_data/action-items.md), identifiers are mandatory whenever the block contains more than one item (or more than one independently-numbered list), and they distinguish actions (`A`) from questions (`Q`).

Example:

```
How should the exported `loadConfig` report a missing file?
1. ■■■ Return `undefined`:
   - ➕ matches the package's three other loaders, so callers keep one pattern
2. ■□□ Throw `ConfigNotFoundError`:
   - ➖ each of the 14 call sites needs a new `try`/`catch` to keep its current behavior
3. □□□ Return an empty config:
   - ➖ a caller cannot tell a missing file from an empty one, so a mistyped path silently disables every setting
```

The decision is the shape of a public API, so the gate renders the menu although one option leads. The leader does not have a `➖` because none survived the check.
