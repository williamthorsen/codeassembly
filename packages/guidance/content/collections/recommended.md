---
name: recommended
description: The vetted, generally applicable set (artifacts any project can declare).
members:
  rulebooks:
    - accessibility-conventions
    - command-output-conventions
    - generated-content-policy
    - readme-conventions
    - shared-data-conventions
  skills:
    - capture-event
    - capture-feedback
---

# Recommended

The public collection. Membership claims that an artifact was examined and found generally applicable: It names nothing specific to one author's environment, does not state any personal doctrine, declares its prerequisites where a reader looks before invoking, and deploys only where it works.

Membership is per-artifact and enumerated in full rather than by dependency root, so the closure check notices every member that an artifact's dependency edges would add.

The skills belong here on different grounds. A rulebook of the personal collection names `capture-feedback` in a body token, and `capture-feedback` names `capture-event` in another. Because a collection cannot be closed over an artifact of lesser standing, both were promoted. `capture-event`'s promotion was forced by that chain rather than chosen on its own merits. It is the one member to re-examine first. `capture-feedback` qualifies on its own terms: It does not name any store, declares the registry needed by a capture, and sends a record to the store that the registry's `feedback_kb` names.

`generated-content-policy` qualifies on its own terms too: What it states is a mechanism that every consumer meets, not a preference, and the guidance that a reader needs beyond the trigger is in the linked reference rather than in the ambient body loaded by every session.

`accessibility-conventions` also qualifies on its own terms. It states an external standard, WCAG 2.2 AA, and floors that do not name any author, repository, or tool. Its body does not contain any invocation token, so its closure is empty.

`command-output-conventions` qualifies on its own terms too. What it states follows from a mechanism that every agent session meets, the cost of output kept in the context window, rather than from a preference, and it does not name any tool, host, or store. Its body does not contain any invocation token, so its closure is empty.

`readme-conventions` qualifies on its own terms as well. It does not name any repository, tool, or path belonging to one author, and what it asks of a README follows from who reads the file rather than from a preference about how a README should read. Its body does not contain any invocation token, so its closure is empty and admitting it extends this collection's reach by nothing.

Adding a skill that declares a guidance hook has a drawback that the current members do not have. A project declaring this collection deploys its own copy of that skill, and that copy shadows the user's home-bound one. Because guidance-hook bindings do not cross the boundary between the user-global and project domains, guidance bound globally by the developer goes missing in that repository until the project binds it too. Weigh that against the general applicability claimed by membership before admitting such a skill.

`shared-data-conventions` qualifies on its own terms too. It states a standard practice, expand, migrate, contract, and the rule that unmerged code does not write to shared state, and it does not name any author, platform, or store: Each repository's `AGENTS.md` names its own. Its body does not contain any invocation token, so its closure is empty.
