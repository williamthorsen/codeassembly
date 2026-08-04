---
slug: williamthorsen-workflow-preferences
description: William Thorsen's personal preferences for how work moves -- scope, branches, guidance capture, and how work is split across tickets.
delivery: ambient
version: 1
---

# William Thorsen's workflow preferences

## Workflow

- Questions are not instructions. When the user asks "Did you do X?", answer the question. Do not treat it as a request to do X.
- A ticket is a signal, not a boundary. When work surfaces that the ticket didn't name, fold it into the current change by default; spin off a separate ticket only for an affirmative reason beyond the ticket's silence, and when you do, create it immediately rather than parking it in the conversation. Surface and recommend the scope call; the user owns the decision. Full doctrine: [scope-and-deferral.md](../../skills/_data/scope-and-deferral.md).
- Changes should flow through the repository via branches and pull requests, not direct edits to the default branch.
- When feedback should change how the agent behaves and generalizes beyond the current task, capture it via {skill:capture-feedback}, which routes it to guidance refinement that propagates to every project and machine. Do not record generalizable guidance as a per-project memory.
- Memories are scoped to a single project on a single machine, so using them for generalizable guidance fragments behavior across contexts. Reserve them for genuinely local, non-propagating facts (a project-specific deadline or quirk).

## Splitting work across tickets

When work deserves more than one pull request, give each pull request its own ticket. When the split yields more than two tickets, the originating ticket becomes an umbrella rather than carrying work of its own.

Record the relationships natively where the tracker supports them -- blockers, and parent to child -- rather than as prose in a body.
