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

When the developer starts a product, the work moves through these stages in order, each producing one thing:

1. Idea: The idea, written back to the developer.
2. Opinions: The views of other perspectives, such as role-based evaluations, recorded with the idea.
3. Brief: The fleshed-out idea, stated as a brief for a prototype round.
4. Prototypes: Competing prototypes and a synthesis of them, built through `prepare-prototype-brief` and judged through `index-prototypes`.
5. End vision: The functionality and a rough structure, approved by the developer.
6. MVP: The smallest usable product that delivers value. It precedes every further feature.
7. Increments: Features added one iteration at a time.

Write a ticket in detail only once its work is about to be implemented or is definitively known. Until then, each artifact holds one tier:

- The epic holds the vision, the decisions, and what is out of scope.
- Milestones hold the ordering.
- The prototype is the vision as an artifact.
- A design doc in the repo holds the functionality and the rough structure.
- Each iteration is a sub-issue of the epic. Specify the current iteration in detail; keep every later one to a one-line ticket, and refine it when its iteration starts.

Once the developer approves the end vision, propose that shape: an epic whose iterations are its sub-issues, with only the first iteration specified in detail. Do not draft every ticket up front, and do not treat the prototype as the plan.

Expect the end vision to change. The documents exist so that a new session knows the vision without being told.
