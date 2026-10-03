---
slug: williamthorsen-ticketing-preferences
description: William Thorsen's preferences for how work is split across tickets, how the relationships between them are recorded, and which figures a ticket body states.
delivery: hook
version: '5'
---

# William Thorsen's ticketing preferences

## Splitting work across tickets

When work deserves more than one pull request, give each pull request its own ticket. When splitting a ticket into two, keep the first piece in the originating ticket. When splitting into more, make the originating ticket an umbrella.

A piece earns a ticket when it ships and can be verified on its own, not when it looks large enough to deserve one. When the count is a judgment, cut finer: Merging two tickets that turned out to be one costs an edit and a close, while splitting one that turned out to be four costs a rewrite of the original, new children, a re-cut plan, and whatever was committed against the superseded contract.

This governs work already judged to need more than one pull request. Whether work discovered mid-change becomes a ticket at all is decided first by the fold-in default in [scope-and-deferral.md](../../skills/_data/scope-and-deferral.md).

Record the relationships natively when the tracker supports them -- blockers, and parent to child -- rather than as prose in a body.

## Counts in a ticket body

State a condition rather than a measurement: "the record covers one file and contains rejections taken at older rule versions", not "257 candidates, 8 of them stale". Admit a figure only when it defines the work: a budget, a threshold, or a value that an acceptance criterion is checked against. A count in an existing ticket that has since drifted is not a defect: Do not re-measure it, report it, or propose an edit to correct it.
