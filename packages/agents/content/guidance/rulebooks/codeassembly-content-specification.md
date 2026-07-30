---
slug: codeassembly-content-specification
description: The declaration contract for CodeAssembly skills, subagents, rulebooks, and collections -- frontmatter fields, dependency blocks, and invocation tokens.
delivery: skill
version: 5
---

# CodeAssembly content specification

The declaration contract for CodeAssembly artifacts -- skills, subagents, rulebooks, and collections. (Here "artifact" means an authored library item, not a generated output like a review or devlog.)

## Enforcement

Every rule below belongs to one of three classes, marked where it appears.

**Validated on parse.** A malformed `slug` or `skill-name`, a `delivery` value outside `ambient`/`skill`, an unknown artifact-type key, a non-list value under one, and a `members:` block on anything but a collection each fail the run with an error naming the source file. Three more fail outside the parser: a token naming an artifact that does not exist fails the run with an error naming the slug and the directories searched, a rulebook link target outside a linkable root fails the run before anything is written, and a harness that declares no sigil is a type error at its `HarnessConfig` literal, so the build fails.

**Enforced by test.** The suites in `packages/agents/src/__tests__/` read the shipped library and assert its conventions hold. A rule one of them guards names its test.

**Convention.** The rest is marked _(Convention; not enforced.)_ Nothing checks it.

## Declaring dependencies

When a rulebook, skill, or subagent relies on another -- a skill that invokes another skill, a subagent that calls a skill it does not inject -- declare the edge in its frontmatter `dependencies:` block, grouped by type:

```yaml
dependencies:
  rulebooks:
    - shell-conventions
  skills:
    - capture-event
```

`sync` resolves these edges transitively, so declaring one artifact pulls in its whole closure. Prefer a declared dependency over a prose note that another artifact "must be present." _(Convention; not enforced.)_

## Invocation tokens

When a skill or subagent invocation appears inline in a skill's or subagent's body, write it as a token rather than a hardcoded harness-specific form:

- `{skill:<slug>}` renders to the harness skill sigil plus the slug -- `/<slug>` on Claude, `!<slug>` on Rovo.
- `{subagent:<slug>}` renders to the harness subagent sigil plus the slug. That sigil is empty on both current harnesses, so it renders to the bare slug, which is how a subagent is dispatched on each.

Slugs are kebab-case and letter-led (`[a-z][a-z0-9-]*`). The sigils are a typed property of each harness in `HarnessConfig`, so a new harness must declare its own rendering or the build fails.

A token is also a dependency edge: `sync` extracts the tokens from a skill's or subagent's include-expanded body and pulls each target into the deploy closure. An inline invocation is therefore expressed once, as the token -- it needs no duplicate `dependencies:` entry, and a token naming a non-existent artifact fails the run just as a missing `dependencies:` edge does. Because extraction runs on the include-expanded body, a token inside a shared `_partials` file becomes an edge for every skill that includes it.

Tokens are honored only in skills and subagents. A rulebook body does pass through a render pass, but a narrower one: it receives link and template rewriting (see [Links in rulebook bodies](#links-in-rulebook-bodies)) and not token rewriting, which is why rulebooks keep `dependencies:`, as collections keep `members:`. Reserve a `dependencies:` entry for a non-inline edge; use a token for any invocation that appears in the body. _(Convention; not enforced.)_

## Links in rulebook bodies

A rulebook addresses a file by linking to it, not by naming it in prose. Author the target relative to the rulebook's own place in the content tree, which is `guidance/rulebooks/<slug>.md`, and `sync` emits the absolute path each target harness can follow. A target of `../../skills/_data/concision.md` reaches Claude as `~/.claude/skills/_data/concision.md` and Rovo as `~/.rovodev/skills/_data/concision.md`. `{harness_home_dir}` and `{harness_id}` expand per harness, including where one opens a link target.

A rulebook may link only into `skills/` and `scripts/`, the two trees whose source layout matches where they deploy under every harness home. Any other target fails the run, with an error naming the rulebook, the target as authored, and whether it resolved outside a linkable root or escaped the content root. `subagents/` is rejected because a subagent is dispatched rather than read, so no link into one is worth authoring; `_partials/`, `collections/`, and `guidance/` never deploy as files, so a link into one would name nothing. Nor can a rulebook link to the skill another rulebook delivers: that `SKILL.md` is generated rather than authored, and `dependencies:` already expresses the relationship. _(Validated on parse.)_

A target that is rooted correctly but names a file that has moved or been deleted is caught separately, by `content-link-resolution.test.ts`, which also resolves every anchor fragment to exactly one heading. _(Enforced by test.)_

One limitation is worth knowing before writing a rulebook that documents linking: rewriting runs over the whole body, so a Markdown link inside a code fence or an inline code span is rewritten along with the rest. A rulebook cannot show a relative link verbatim as an example, and must describe the target instead.

## Collections

A collection's only payload is a `members:` block -- the constituents it pulls into the deployed closure. List them per type (the same shape `dependencies:` uses), or use the computed token `'@library'` for every rulebook, skill, and subagent in the content root the collection belongs to -- the built-in library, or the owning source for a source collection:

```yaml
members:
  skills:
    - capture-feedback
  subagents:
    - canary
```

`members:` is collections-only; rulebooks, skills, and subagents use `dependencies:` instead. Declaring `dependencies:` on a collection, or `members:` on any other type, is an error. The resolver follows both keys identically -- the split is semantic: a collection contains members, an artifact depends on prerequisites.

## Frontmatter fields

- **Rulebooks:** `slug`, optional `description`, optional `delivery` (`ambient`, `skill`, or both; defaults to `ambient`), optional `skill-name`, optional `version`.
- **Skills:** `name`, `description`, optional `user-invocable` (defaults to `true`), optional `harnesses` (a harness id or list restricting deployment to those harnesses; absent deploys to all).
- **Subagents:** `name`, `description`, `tools`, optional `maxTurns`, optional `skills` (skills injected into the subagent's context; `sync` pulls them into the deploy closure automatically).
- **Collections:** `name`, `description`, and a `members:` block -- the collection's only payload.

Only the rulebook row is validated on parse; a `members:` block is validated wherever it appears. The other rows are read leniently: a field a deploy pass consumes takes effect, and an absent one falls back to a default rather than failing, so a skill with no `description` reaches Rovo's prompt index with an empty one. _(Convention; not enforced.)_

## Naming

A `delivery: skill` rulebook ships as `consult-<slug>`.

Skill names are verb-led. Order list members and frontmatter lists alphabetically unless there is a reason to group otherwise. _(Conventions; not enforced.)_

A `codeassembly-` prefix marks an artifact governing this repository's own mechanics, as this specification does. Its absence marks content that would still apply in another project. Prefix a new artifact only when it would be meaningless outside this repository. _(Convention; not enforced.)_

## Skill-local reinforcement

Behavioural rules that govern an agent's output -- the recommendation gradient, the action-items block -- are stated once in `AGENTS.md` and the shared `_data` specs, then restated at the step that produces the output: as a pointer in the skill body, or as a rendered example inlined from `_partials/`. An agent follows a rule more reliably when it sits beside the action it governs than when it was read once at session start, and it imitates a nearby concrete example more reliably still than it follows a directive.

Treat that restatement as load-bearing redundancy, not duplication. A DRY-driven refactor that strips the skill-local pointers and leaves only the global rule removes the mechanism by which the global rule takes effect. _(Enforced by `action-item-reinforcement.test.ts` and `spec-inlining.test.ts`.)_
