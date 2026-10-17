---
name: all
description: The whole content library (every rulebook, skill, and subagent), computed automatically.
members: '@library'
---

# All

The whole-catalog collection. `members: '@library'` resolves to every rulebook, skill, and subagent in the content library, computed at resolution time so that the resolver includes a newly added artifact automatically, without an edit here. Collections are excluded: The resolver never emits them, and "every collection" would be self-referential.

This is the fallback, not the expected declaration. It does not make any claim about its members: It deploys the vetted, the unexamined, and the artifacts deliberately left out of every collection alike, and it includes a newly added artifact before anyone has read it. A consumer should declare the collections whose dispositions it wants instead, and declare this one only to deploy the whole catalog.
