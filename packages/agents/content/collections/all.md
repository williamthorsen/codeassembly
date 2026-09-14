---
name: all
description: The whole content library (every rulebook, skill, and subagent), computed automatically.
members: '@library'
---

# All

The whole-catalog collection. `members: '@library'` resolves to every rulebook, skill, and subagent in the content library, computed at resolution time so that a newly added artifact joins automatically with no edit here. Collections are excluded: The resolver never emits them, and "every collection" would be self-referential.

This is the escape hatch, not the expected declaration. It makes no claim about its members: It deploys the vetted, the unexamined, and the artifacts deliberately left out of every collection alike, and a newly added artifact joins it before anyone has read it. A consumer should declare the collections whose dispositions it wants instead, and reach for this one only to take the catalog whole.
