---
slug: williamthorsen-workflow-preferences
description: William Thorsen's personal preferences for how work moves -- scope, branches and worktrees, guidance capture, and the arc of product development.
delivery: ambient
version: '7'
---

# William Thorsen's workflow preferences

## Workflow

- Questions are not instructions. When the user asks "Did you do X?", answer the question. Do not treat it as a request to do X.
- A ticket is a signal, not a boundary. When work appears that the ticket didn't name, fold it into the current change by default; spin off a separate ticket only for an affirmative reason beyond the ticket's silence, and when you do, create it immediately rather than parking it in the conversation. Recommend the scope call and build on it: A fold-in is provisional and surfaces at the ticket checkpoint; a spin-off creates remote state, so it is asked before it is created. Full doctrine: [scope-and-deferral.md](../../skills/_data/scope-and-deferral.md).
- Make changes through branches and pull requests, not by editing the default branch directly.
- When feedback should change how the agent behaves and generalizes beyond the current task, capture it via {skill:capture-feedback}. The capture records evidence for a later refinement pass; it does not change any behavior until that pass writes the lesson into guidance and the guidance is deployed. Do not record generalizable guidance as a per-project memory.
- Memories are scoped to a single project on a single machine, so using them for generalizable guidance fragments behavior across contexts. Reserve them for genuinely local, non-propagating facts (a project-specific deadline or quirk).

## Branch and worktree management

Never create a branch or worktree without explicit authorization. Never switch a worktree to another branch; one ticket's work happens entirely in one worktree, and work on another ticket starts a new session in that ticket's own worktree.

After a merge, say nothing about worktree or branch state and never offer to manage it. The worktree stays as long as its branch does, so there is nothing to clean up and nothing to ask about.

## Cross-repo sequencing

When the work would be better done upstream, in a package or repository on which this one depends, the default order is upstream first: Merge the upstream change, publish it, upgrade the dependency here, then make the downstream change against the upgraded version. Propose that order, and do not propose merging a downstream workaround ahead of it.

Downstream first reads as faster because something is merged sooner, but it requires two downstream changes rather than one: the workaround, then its removal once the upstream change is merged. It also forces upstream to decide without the downstream requirement in hand, so upstream cannot weigh that requirement against its own constraints, and may settle on a shape that the consumer keeps working around.

Default to upstream first. A condition can displace the default: an upstream that is unowned, unresponsive, or on a release cadence that will not accommodate the work. When one does, name it, recommend the order, and build on the recommendation; the developer vetoes.

## Product development

When the developer starts a product, the work moves through these stages in order, each producing one thing. A stage is skipped when the product is small enough that its output is already obvious; say which stage, and why.

1. Idea: The idea, written back to the developer and recorded in the design doc.
2. Opinions: Evaluations of the idea from other roles, recorded with it.
3. Brief: The idea fleshed out into a brief for a prototype round.
4. Prototypes: Competing prototypes of a rich feature set and a synthesis of them, built through `prepare-prototype-brief` and judged through `index-prototypes`. Prototyping a rich feature set is how the product that could emerge becomes visible, which is why the round precedes the vision.
5. End vision: The purpose, the non-goals, the decisions with their reasons, and a rough structure, written from what the prototypes taught and approved by the developer.
6. MVP: The smallest product that does the product's one job. A feature is in the MVP only when the product cannot do that job without it.
7. Increments: Features added one iteration at a time.

The winning prototype is the baseline: the floor on quality and feel. The finished product is at least that good. The prototype is authoritative about look and interaction and about nothing else; a data model, an architecture, or an iteration's scope is never read off it.

The baseline binds the epic's completion, not any iteration. An iteration may omit a prototype feature or ship it in a reduced form. A reduction is remaining work and gets a one-line sub-issue, which keeps the gap visible. A deviation that improves on the prototype is expected. Settling a feature below the prototype's bar, or retiring it, takes a recorded decision in the design doc, with its reason.

Specify a ticket in detail only when its work is about to be implemented. Until then, each artifact holds one tier:

- The design doc in the repo is the living home of the vision: the purpose, the non-goals, the decisions with their reasons, and the rough structure. A statement belongs in it when reversing the statement later would invalidate completed work, or when a new session needs it to choose a direction. Everything else is an iteration-time detail.
- The epic points to the design doc, states what is out of scope, and lists the iterations as its sub-issues in order. It does not restate the vision, because a ticket's body is frozen once its work starts and the vision is not.
- The milestone marks the current iteration, which `pull-from-backlog` reads as the Now set.
- The prototype is the baseline.
- Each iteration is a sub-issue of the epic. Specify the current iteration in detail. Write each later one as a one-line outcome, what the user can newly do, rather than as a feature, and refine it against the design doc when its iteration starts.

Once the developer approves the end vision, propose that shape. Do not draft every ticket up front.

The vision will change. At the end of each iteration, re-read the design doc, revise what the iteration disproved, and refine the next sub-issue against the revised doc. The documents exist so that a new session knows the vision without being told.
