# Spike conventions

Spike work is an investigation, not a build: Its artifacts answer questions and enable a decision rather than deliver observable software behavior. This file defines the spike-shaped ticket and plan templates that the ticket- and plan-authoring skills use in place of their feature templates when the work is a spike.

Spike mode is entered explicitly (the invocation signals it) and is not auto-detected from ticket type, label, or title. Everything outside the two templates below (source resolution, staleness, Q&A, saving) is unchanged from the feature flow.

The concision and content-placement doctrines for feature tickets and plans apply unchanged; only what differs for a spike is stated here.

## Spike ticket template

```markdown
# Spike: {question}

## Question

{What is unknown, and why the answer matters: the uncertainty driving the spike.}

## Context

{Background, prior art, what prompted the question.}

## Scope

{What will and won't be investigated: "explore X, not Y".}

## Timebox

{Effort ceiling, e.g. "1 day".}

## Acceptance criteria

### Questions to answer

- [ ] {A question the investigation must resolve.}

### Decisions to enable

- [ ] {A decision the findings must make possible.}

Deliverable: a findings & recommendation artifact.
```

`Context` and `Scope` are opt-in: Include either only when it adds signal the reader must act on.

Differences from the feature ticket: `Question` replaces `Problem`; `Timebox` is a first-class section; acceptance criteria are questions-to-answer and decisions-to-enable rather than observable-behavior checkboxes; there is no test or documentation criterion; the deliverable is a findings artifact, saved via the standard `save-artifact` conventions (no dedicated artifact type).

## Spike plan template

```markdown
# Spike plan: {Title}

## Context

{What the spike investigates and how this plan connects to the ticket.}

## Approach

{The investigation strategy in 2-3 sentences.}

## Timebox

{Effort ceiling, mirroring the ticket.}

## Investigation steps

### Step 1: {Line of inquiry}

**Probes:** {Which question this step answers.}
**How:** {Approach: code read, throwaway prototype, benchmark, experiment.}
**Answered when:** {What resolving this step looks like.}

## Open questions & risks

{Unknowns that may redirect the investigation.}

## Deliverable

{The findings & recommendation artifact: the answers reached, a recommendation, and residual unknowns.}
```

Differences from the feature plan: Investigation steps framed by the question each probes replace tasks with create/modify/test file lists; `Timebox` is first-class; `Deliverable` replaces `Verification`, since a spike produces findings rather than verifiable behavior; there is no per-step test or documentation criterion.

## Aligning a spike

When `align-ticket-with-implementation` reconciles a spike, the branch's "implementation" is the findings: Reconcile whether the investigation answered its questions and reached a recommendation, not whether the branch met acceptance criteria. Align the ticket's questions and decisions to what the investigation actually concluded.
