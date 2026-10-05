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

When the developer starts a product, move the work through these stages in order, each producing one thing. Skip a stage when the product is small enough that its output is already obvious, and say which stage and why.

1. Idea: Write the idea back to the developer and record it in the design doc.
2. Opinions: Evaluate the idea from other roles and record the evaluations with it.
3. Brief: Flesh the idea out into a brief for a prototype round.
4. Prototypes: Build competing prototypes of a rich feature set through `prepare-prototype-brief`, judge them through `index-prototypes`, and synthesize them. Prototyping a rich feature set is how the product that could emerge becomes visible, so run the round before writing the vision.
5. End vision: Write the purpose, the non-goals, the decisions with their reasons, and a rough structure from what the prototypes taught, and get the developer's approval.
6. MVP: Build the smallest product that does the product's one job. Put a prototype feature in it when the product cannot do that job without the feature, and leave the rest for increments.
7. Increments: Add features one iteration at a time.

Treat the winning prototype as the baseline: the floor on quality and feel against which the finished product is judged, and the reference for what the product does and how it is put together. Read it as evidence of the vision rather than as its specification: Let its structure inform the design doc, and expect to improve on it.

Hold the finished product to the baseline, not any one iteration. An iteration may omit a prototype feature or ship it in a reduced form; treat a reduction as remaining work and give it a one-line sub-issue, which keeps the gap visible. When settling a feature below the prototype's bar or retiring it, record the decision in the design doc with its reason.

Write a ticket in detail when its work is about to be implemented. Until then, keep each artifact to one tier:

- Keep the vision in a design doc in the repo: the purpose, the non-goals, the decisions with their reasons, and the rough structure. Put a statement there when reversing it later would invalidate completed work, or when a new session needs it to choose a direction, and leave most other detail to its iteration.
- Have the epic point to the design doc, state what is out of scope, and list the iterations as its sub-issues in order. Keep the vision out of the epic's body, because a ticket's body is frozen once its work starts and the vision is not.
- Use the milestone to mark the current iteration, which `pull-from-backlog` reads as the Now set.
- Treat the prototype as the baseline.
- Make each iteration a sub-issue of the epic. Specify the current iteration in detail. Write each later one as a one-line outcome, what the user can newly do, rather than as a feature, and refine it against the design doc when its iteration starts.

Once the developer approves the end vision, propose that shape rather than drafting every ticket up front.

Expect the vision to change. At the end of each iteration, re-read the design doc, revise what the iteration disproved, and refine the next sub-issue against the revised doc. The documents exist so that a new session knows the vision without being told.
