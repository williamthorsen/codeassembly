---
name: all
description: The whole content library — every rulebook, skill, and subagent, computed automatically.
members: '@library'
---

# All

The whole-catalog collection. `members: '@library'` resolves to every rulebook, skill, and subagent in the content library, computed at resolution time so a newly added artifact joins automatically with no edit here. Collections are excluded — the resolver never emits them, and "every collection" would be self-referential.
