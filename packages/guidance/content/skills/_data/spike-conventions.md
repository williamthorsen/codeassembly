# Spike conventions

Spike work is an investigation, not a build: Its artifacts answer questions and enable a decision rather than deliver observable software behavior. This file defines the spike-shaped ticket and plan templates that the ticket- and plan-authoring skills use in place of their feature templates when the work is a spike, and the [closing post](#closing-post) that ends every spike.

The ticket is the record of a spike, and the findings artifact is its log: The artifact holds the full findings and the evidence, and the ticket holds what the spike concluded. See [Purpose](artifact-conventions.md#purpose) for the artifact directory's role.

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

- [ ] {A question that the investigation must resolve.}

### Decisions to enable

- [ ] {A decision that the findings must make possible.}

Deliverable: a findings & recommendation artifact, and the closing post on this ticket.
```

`Context` and `Scope` are opt-in: Include either only when it adds signal on which the reader must act.

Differences from the feature ticket: `Question` replaces `Problem`; `Timebox` is a first-class section; acceptance criteria are questions-to-answer and decisions-to-enable rather than observable-behavior checkboxes; the spike ticket does not have a test or documentation criterion; the deliverable is a findings artifact, saved via the standard `save-artifact` conventions (without a dedicated artifact type), and the [closing post](#closing-post) on the ticket.

## Spike plan template

```markdown
# Spike plan: {Title}

## Context

{What the spike investigates and how this plan connects to the ticket.}

## Approach

{The investigation strategy in 2-3 sentences.}

## Decisions taken

- {🔲 while it awaits the checkpoint} {A decision that the agent took without asking, with its one-line reason.}

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

{The findings & recommendation artifact (the answers reached, a recommendation, and residual unknowns), and the closing post on the ticket, offered at the closing checkpoint and made on consent, per `spike-conventions.md` § Closing post.}
```

Differences from the feature plan: Investigation steps, each framed by the question that it probes, replace tasks with create/modify/test file lists; `Timebox` is first-class; `Deliverable` replaces `Verification`, since a spike produces findings rather than verifiable behavior, and it names the [closing post](#closing-post); a step does not have a test or documentation criterion.

## Closing post

The agent that ends a spike posts its conclusion on the ticket as a comment. The post contains:

- The answer to each of the ticket's questions to answer.
- The recommendation on each of the ticket's decisions to enable.
- The counts and the proposed groupings, when the spike produced them.
- Links to the published page, when the spike published one, and to the findings artifact, with the artifact's path written `~/`-relative, so that the post does not publish a home-directory path.

Offer the post as an item in the closing action-items block, show its body, and post it only on consent: It is a remote write, and the developer is the one who can tell whether a finding is fit for the ticket's tracker. When the session does not have a ticket, do not offer it.

Pass the body through a file, per [gh body file](ticket-source-resolution.md#gh-body-file). Before posting, read the ticket's comments, and skip the post when a comment already opens with the post's first line, so that a rerun does not post it twice.

## Aligning a spike

When `align-ticket-with-implementation` reconciles a spike, the branch's "implementation" is the findings: Reconcile whether the investigation answered its questions and reached a recommendation, not whether the branch met acceptance criteria. Align the ticket's questions and decisions to what the investigation actually concluded.
