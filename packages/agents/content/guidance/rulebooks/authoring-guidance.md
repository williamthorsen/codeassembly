---
slug: authoring-guidance
description: Conventions for authoring CodeAssembly skills, subagents, rulebooks, and collections.
delivery: skill
version: 2
---

# Authoring guidance

Conventions for authoring CodeAssembly artifacts — skills, subagents, rulebooks, and collections. (Here "artifact" means an authored library item, not a generated output like a review or devlog.)

## Declaring dependencies

When a rulebook, skill, or subagent relies on another — a skill that invokes another skill, a subagent that calls a skill it does not inject — declare the edge in its frontmatter `dependencies:` block, grouped by type:

```yaml
dependencies:
  rulebooks:
    - shell-conventions
  skills:
    - capture-event
```

`sync` resolves these edges transitively, so declaring one artifact pulls in its whole closure. Prefer a declared dependency over a prose note that another artifact "must be present."

## Collections

A collection's only payload is a `members:` block — the constituents it pulls into the deployed closure. List them per type (the same shape `dependencies:` uses), or use the computed token `'@library'` for every rulebook, skill, and subagent in the library:

```yaml
members:
  skills:
    - capture-feedback
  subagents:
    - canary
```

`members:` is collections-only; rulebooks, skills, and subagents use `dependencies:` instead. Declaring `dependencies:` on a collection, or `members:` on any other type, is an error. The resolver follows both keys identically — the split is semantic: a collection contains members, an artifact depends on prerequisites.

## Frontmatter fields

- **Rulebooks:** `slug`, `description`, `delivery` (`ambient`, `skill`, or both), optional `skill-name`, optional `version`.
- **Skills:** `name`, `description`, optional `user-invocable` (defaults to `true`).
- **Subagents:** `name`, `description`, `tools`, optional `maxTurns`, optional `skills` (skills injected into the subagent's context; `sync` pulls them into the deploy closure automatically).
- **Collections:** `name`, `description`, and a `members:` block — the collection's only payload.

## Naming

A `delivery: skill` rulebook ships as `consult-<slug>`. Skill names are verb-led. Order list members and frontmatter lists alphabetically unless there is a reason to group otherwise.
