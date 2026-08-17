---
name: plan
description: Create an implementation plan from a ticket or task description
user-invocable: true
dependencies:
  skills:
    - emit-event
---

# Plan

Create an implementation plan from a ticket or task. `plan` is the standalone plan-phase entry point: Given a good ticket, it produces the same implementation plan that `design-and-plan` produces with its design phase skipped. For interactive design exploration and ticket refinement before planning, use `design-and-plan`, which runs this same plan phase after its design phase.

## Arguments

- Task source (required): Issue URL, shorthand reference (`#99`, `issue 99`), file path, or description of what to build
- `--role=<role>` (optional): Agent role for run artifact naming (default: `agent`)

## Resolve the task source

Resolve the task source using the [ticket source resolution](../_data/ticket-source-resolution.md) table, then read the resolved ticket or description and plan against it. When the source resolves to a URL, persist it to the branch manifest per [Stored ticket URL](../_data/ticket-source-resolution.md#stored-ticket-url) so a later session needs no ticket argument. `plan` does not run the staleness check or interactive design Q&A; that ceremony belongs to `design-and-plan`. When the source is a free-form description rather than a ticket, plan directly from the description. Once the source is resolved, emit `skill.started` (payload `{"skill":"plan"}`) per [Lifecycle events](#lifecycle-events).

When the resolved source is a local artifact, read its `provenance.skill`: `design-and-plan` means an interactive design phase ran; another skill means the ticket was authored without one. Remote issues and free-form descriptions carry no provenance.

## Output format

The plan begins with YAML frontmatter conforming to the canonical schema; see the canonical example in [artifact-conventions.md](../_data/artifact-conventions.md#universal-artifact-frontmatter) and the [plan provenance](../_data/artifact-conventions.md#plan-provenance) extension; field-resolution steps live in the [Frontmatter resolution](#frontmatter-resolution) section below. `provenance.model` is omitted: The plan is produced in an interactive, user-invoked session (the user supplies and vets the source ticket and approves the next step).

The body following the frontmatter uses the shared implementation-plan template, the same one `design-and-plan` Phase 5 inlines, so both skills emit an identical plan:

**Spike mode.** If the task is a spike, use the spike plan template in [spike conventions](../_data/spike-conventions.md) in place of the template below.

<!-- include: ../_partials/plan-template.md / -->

## Guidance

- Focus on clarity and actionability
- Include concrete steps, not vague goals
- Call out risks and unknowns explicitly
- When comparing approaches, rank options per [design priorities](../_data/design-priorities.md)

<!-- include: ../../_partials/plain-speech.md / -->

## Sweep for completeness

<!-- include: ../_partials/ticket-and-plan-completeness.md / -->

## Saving

Resolve artifact directory based on context.

### Frontmatter resolution

The artifact frontmatter conforms to the [universal artifact frontmatter](../_data/artifact-conventions.md#universal-artifact-frontmatter) schema.

Run `{harness_home_dir}/scripts/resolve-frontmatter.sh --skill plan --interactive true` via Bash. Prepend the output verbatim to the artifact body.

### Run context

If inside an active run (`run-index.json` exists in a parent directory):

- Save as run artifact: `{run-dir}/{timestamp}_{role}_plan.md`
- Role comes from `--role` argument (default: `agent`)

### Ticket context

1. Invoke `node {harness_home_dir}/skills/derive-session-context/derive-session-context.mjs` via Bash to obtain `ticket_id`, `project_slug`, and `artifact_base_dir` from the manifest JSON emitted on stdout. If no ticket ID is available, auto-generate: `{YYYYMMDD}-{4 random hex}`.
2. Save as ticket-level artifact: `{artifact_base_dir}/projects/{project_slug}/tickets/{ticket_id}/{timestamp}_{slug}_plan.md`
3. Slug derived from the plan's descriptive title (kebab-case, max 60 chars).

Follow [artifact conventions](../_data/artifact-conventions.md).

`mkdir -p` the target directory before writing.

Artifact type: `plan`. Filename format:

```
{YYYYMMDD-HHMMSSZ}_{slug}_plan.md
```

Example: `20260223-143000Z_migrate-auth-to-oauth2_plan.md`

## Completion

Once the plan is saved, emit `artifact.written` (payload `{"path":"<path>","kind":"plan"}`) per [Lifecycle events](#lifecycle-events), then emit `skill.completed` (payload `{"outcome":"plan-saved"}`) on the same turn, before the next-steps prompt below. Emitting completion at the save point folds an abandoned session to a finished state.

Report the file path when done.

```
Plan saved: {plan_path}
```

As you present the next-steps menu, emit `input.requested` (payload `{"prompt":"next-steps"}`) per [Lifecycle events](#lifecycle-events).

<HARD-GATE>
Follow the options, output format, and recommendation rules in [next-steps options](#next-steps-options) exactly. Do not improvise the options. For recommendation context, supply the source's design provenance from the resolve step — `plan` adds no interactive design phase of its own. Include both `{plan_path}` and `{ticket_source}` in each skill-invoking option line; omit the ticket path when the source was a free-form description rather than a ticket.
</HARD-GATE>

<!-- include: ../_partials/next-steps-after-plan.md / -->

<!-- include: ../_partials/option-format.md / -->

<!-- include: ../_partials/lifecycle-events.md / -->
