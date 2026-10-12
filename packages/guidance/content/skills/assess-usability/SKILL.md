---
name: assess-usability
description: Assess a product's usability through three to five lenses, one subagent per lens walking its use cases in a shared browser, and merge their reports into a ranked findings artifact that a triage pass can dispose of. Use when asked to evaluate a site's or an app's usability, or to find the bugs, flaws, and obvious gaps that a user would meet.
user-invocable: true
supported-harnesses: [claude]
---

# Assess usability

Find where a product would lead its users to conclude that it is broken or unfinished. Each lens is a {subagent:usability-assessor} that walks its use cases in a browser, without seeing any other lens's report. You prepare the targets, write the brief that every lens reads, dispatch the lenses one at a time, and merge their reports into one findings artifact.

The skill writes nothing remote: It does not create a ticket, post a comment, or edit an issue. The findings artifact is the input of `triage-spike-findings`, which decides what becomes a ticket.

## Inputs

- **The targets**: the URLs or local stacks to assess.
- **The roles**: the kinds of user that the product serves, such as a signed-out visitor, a member, and an administrator. When the developer does not name them, derive them from the repository's routes and its auth model.
- **The ticket**, optional. Without one in session, `{skill:save-artifact}` saves the artifacts under the ticket ID that it generates.

Read the declared stage of the project under assessment from `node {harness_home_dir}/skills/derive-session-context/derive-session-context.mjs`. When `project_sensitivity` is `personal` or `confidential`, every lens uses seeded or test data only, and no target that holds real users' data is used for anything but reading public pages.

## Process

### 1. Prepare the targets

Resolve the ticket directory per {skill:save-artifact}, and create `{ticket_dir}/usability/` with one subdirectory per lens.

- **The browser.** The lenses share one browser that the Playwright MCP server drives, so they run one after another. Confirm that the browser answers before anything else; when it does not, ask the developer for one and stop.
- **The local stack.** When a target is local, confirm that it runs, and start it by the repository's own scripts when it does not. Use a development build that reaches only the local stack, never a script that reaches a hosted service.
- **Sign-in state.** For each hosted target, find out whether the browser profile is signed in on it. A lens opens its own browser context for a signed-out view; nothing signs the profile out.

### 2. Write the brief

Write the brief to `{ticket_dir}/usability/brief.md`, with these sections:

1. **Product.** What the product is and whom it serves, in two or three sentences.
2. **Targets.** One row per target: its URL, its write rule, its sign-in state, and the method by which a lens grants itself a role or an approval there. A target is read-only unless it is on `localhost` or the developer names it as disposable, per {rulebook:shared-data-conventions}. Writes go to a writable target, with `@example.com` accounts that the lens creates.
3. **Lenses.** Three to five: one per role, and one for styling and access. Give each a unique ID prefix (two roles can share an initial), its targets, and its minimum use cases, each with its route. The styling-and-access lens covers light and dark mode, a 1440×900 and a 390×844 viewport, and keyboard-only use of the other lenses' core flows, against the floors in {rulebook:accessibility-conventions}. It runs last, so that it can reach every screen that the earlier lenses found.
4. **Exclusions.** Routes, surfaces, and products out of scope, such as a developer-only page or a browser extension.
5. **Settled.** The decisions above, stated as final, so that a lens does not re-decide them.

### 3. Checkpoint

Save the brief with {skill:save-artifact} as a ticket-level `usability-brief` artifact, and show it to the developer. Ask in one action-items block for approval of the brief, and for any target that the developer wants to mark disposable. Do not dispatch any lens before approval.

<!-- include: ../_partials/action-items.md / -->

### 4. Dispatch the lenses

Dispatch one lens at a time, in the order of the brief's lens table, and wait for each to return before dispatching the next. Send one {tool:Task} call, `subagent_type: usability-assessor`, with this block and nothing else composed into it:

```dispatch
brief: {path to the saved brief}
lens: {lens name}
output: {ticket_dir}/usability/{lens slug}/
```

Never pass one lens's report, or anything learned from it, to a later lens: Each lens's value is its independent view, and the synthesis removes the duplicates.

**A reply that lacks the `Phase: usability-assessment` line is a lens stopped by its turn limit.** Resume that lens once, asking only for its report; on Claude Code, send it a message with `SendMessage`, addressed by the agent ID that its dispatch returned. When the resumed lens still does not return a report, do not dispatch it again: Record the lens as not reported, and continue with the next.

Save each report as `{ticket_dir}/usability/{lens slug}-report.md` as soon as it returns.

### 5. Synthesize

Merge the reports into one findings document:

- **Ranked findings.** Merge findings that describe one problem across lenses, keeping every source ID and every evidence path. Rank by effect (blocks, slows, confuses, polish), then by reach: the number of distinct use cases, across all lenses, in whose flow the finding was reported. A merged finding takes the strongest effect of its sources and states `Reproduced: yes` when any source does.
- **Use cases.** Each lens's use cases with their outcomes.
- **Ideas.** Every lens's ideas, with duplicates merged and each one's source IDs kept. An idea never enters the ranked findings.
- **Proposed groupings.** Findings that one change would fix, grouped, each group with a one-line title and its finding IDs. Do not search the tracker or file anything: `triage-spike-findings` checks each group against the open issues.
- **Residual unknowns.** Every use case marked `not exercised`, every entry under a report's **Limits**, and every lens recorded as not reported.
- **Method.** One paragraph: the lenses, the targets with their write rules, and the order of the runs.
- **Lens reports.** Each report, appended unedited.

Write every evidence path relative to `{ticket_dir}`, so that a later session can open the evidence that a finding cites.

### 6. Save and publish

Save the document with {skill:save-artifact} as a ticket-level `usability-findings` artifact.

Then publish it as an artifact page: Load the artifact-design skill, and render the ranked findings as a table that can be filtered by effect, followed by the ideas and the residual unknowns. List each finding's evidence paths; do not embed the screenshots.

### 7. Report

Give the developer the findings artifact's path, the page's URL, and one line of counts: use cases exercised, findings by effect, and ideas. Name `triage-spike-findings` as the next step, with the findings artifact's path as its input.
