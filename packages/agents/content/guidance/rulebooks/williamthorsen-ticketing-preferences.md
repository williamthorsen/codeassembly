---
slug: williamthorsen-ticketing-preferences
description: William Thorsen's preferences for how work is split across tickets and how the relationships between them are recorded.
delivery: hook
version: '3'
---

# William Thorsen's ticketing preferences

## Splitting work across tickets

When work deserves more than one pull request, give each pull request its own ticket. When the split yields more than two tickets, the originating ticket becomes an umbrella rather than describing work of its own.

A piece earns a ticket when it ships and can be verified on its own, not when it looks large enough to deserve one. Where the count is a judgment, cut finer: Merging two tickets that turned out to be one costs an edit and a close, while splitting one that turned out to be four costs a rewrite of the original, new children, a re-cut plan, and whatever was committed against the superseded contract.

This governs work already judged to need more than one pull request. Whether work discovered mid-change becomes a ticket at all is decided first by the fold-in default in [scope-and-deferral.md](../../skills/_data/scope-and-deferral.md).

Record the relationships natively when the tracker supports them -- blockers, and parent to child -- rather than as prose in a body.
