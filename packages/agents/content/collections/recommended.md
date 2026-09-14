---
name: recommended
description: The vetted, generally applicable set (artifacts any project can declare).
members:
  rulebooks:
    - generated-content-policy
    - readme-conventions
  skills:
    - capture-event
    - capture-feedback
---

# Recommended

The public collection. Membership claims an artifact was examined and found generally applicable: It names nothing specific to one author's environment, states no personal doctrine, declares its prerequisites where a reader looks before invoking, and deploys only where it works.

Membership is per-artifact and enumerated in full rather than by dependency root, so the closure check reads a set that nobody's edges can quietly extend.

The skills belong here on different grounds. A rulebook of the personal collection names `capture-feedback` in a body token, and `capture-feedback` names `capture-event` in another; no collection can be closed over an artifact of lesser standing, so both were promoted. `capture-event`'s promotion was forced by that chain rather than chosen on its own merits, so it is the one member to re-examine first. `capture-feedback` qualifies on its own terms: It names no store, declares the registry needed by a capture, and routes a record by a rule that any registry can answer.

`generated-content-policy` qualifies on its own terms too: What it states is a mechanism that every consumer meets, not a preference, and the guidance that a reader needs beyond the trigger is in the linked reference rather than in the ambient body loaded by every session.

`readme-conventions` qualifies on its own terms as well. It names no repository, tool, or path belonging to one author, and what it asks of a README follows from who reads the file rather than from a preference about how a README should read. Its body contains no invocation token, so its closure is empty and admitting it extends this collection's reach by nothing.

Adding a skill that declares a guidance hook has a cost that no current member has. Guidance-hook bindings do not cross the boundary between the user-global and project domains, so a project declaring this collection deploys its own copy of that skill and shadows the user's home-bound one: Guidance bound globally by the developer goes missing in that repository until the project binds it too. Weigh that against the general applicability claimed by membership before admitting such a skill.
