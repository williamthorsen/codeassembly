---
slug: williamthorsen-workflow-preferences
description: William Thorsen's personal preferences for how work moves -- scope, branches and worktrees, and guidance capture.
delivery: ambient
version: '4'
---

# William Thorsen's workflow preferences

## Workflow

- Questions are not instructions. When the user asks "Did you do X?", answer the question. Do not treat it as a request to do X.
- A ticket is a signal, not a boundary. When work appears that the ticket didn't name, fold it into the current change by default; spin off a separate ticket only for an affirmative reason beyond the ticket's silence, and when you do, create it immediately rather than parking it in the conversation. Raise and recommend the scope call; the user owns the decision. Full doctrine: [scope-and-deferral.md](../../skills/_data/scope-and-deferral.md).
- Make changes through branches and pull requests, not by editing the default branch directly.
- When feedback should change how the agent behaves and generalizes beyond the current task, capture it via {skill:capture-feedback}, which sends it to guidance refinement that propagates to every project and machine. Do not record generalizable guidance as a per-project memory.
- Memories are scoped to a single project on a single machine, so using them for generalizable guidance fragments behavior across contexts. Reserve them for genuinely local, non-propagating facts (a project-specific deadline or quirk).

## Branch and worktree management

Never create a branch or worktree without explicit authorization. Never switch a worktree to another branch; one ticket's work happens entirely in one worktree, and work on another ticket starts a new session in that ticket's own worktree.

After a merge, say nothing about worktree or branch state and never offer to manage it. The worktree stays as long as its branch does, so there is nothing to clean up and nothing to ask about.

## Cross-repo sequencing

When the work would be better done upstream, in a package or repository on which this one depends, the default order is upstream first: Merge the upstream change, publish it, upgrade the dependency here, then make the downstream change against the upgraded version. Propose that order, and do not propose merging a downstream workaround ahead of it.

Downstream first reads as faster because something is merged sooner, but it requires two downstream changes rather than one: the workaround, then its removal once the upstream change is merged. It also forces upstream to decide without the downstream requirement in hand, so upstream cannot weigh that requirement against its own constraints, and may settle on a shape that the consumer keeps working around.

The order remains the developer's call, and a condition can displace the default: an upstream that is unowned, unresponsive, or on a release cadence that will not accommodate the work. Name the condition and let them decide, rather than resolving it by reverting to downstream first.
