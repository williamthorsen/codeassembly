---
slug: codeassembly-content-specification
description: The declaration contract for CodeAssembly skills, subagents, rulebooks, and collections -- frontmatter fields, dependency blocks, and invocation tokens.
delivery: skill
version: 11
---

# CodeAssembly content specification

The declaration contract for CodeAssembly artifacts -- skills, subagents, rulebooks, and collections. (Here "artifact" means an authored library item, not a generated output like a review or devlog.)

## Enforcement

Every rule below belongs to one of three classes, marked where it appears.

**Validated on parse.** A malformed `slug` or `skill-name`, a `delivery` value outside `ambient`/`hook`/`skill`, an empty `delivery` list, an unknown artifact-type key, a non-list value under one, and a `members:` block on anything but a collection each fail the run with an error naming the source file. Six more fail outside the parser: a token naming an artifact that does not exist fails the run with an error naming the slug and the directories searched, a rulebook link target outside a linkable root fails the run before anything is written, a rulebook token naming a target that deploys no skill to invoke fails the same pre-write pass, an anchor-only link target that names no heading in its own body fails wherever that body is rendered or shipped, so does a code fence nothing closes, and a harness that declares no sigil is a type error at its `HarnessConfig` literal, so the build fails.

**Enforced by test.** The suites in `content/__tests__/` read the shipped library and assert its conventions hold. Where one of them guards a rule, the rule names its test.

**Convention.** The rest is marked _(Convention; not enforced.)_ Nothing checks it.

## Declaring dependencies

When a rulebook, skill, or subagent relies on another -- such as a skill that invokes another skill, or a subagent that calls a skill it does not inject -- declare the edge in its frontmatter `dependencies:` block, grouped by type:

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

- `{rulebook:<slug>}` renders to the harness skill sigil plus the skill name the named rulebook deploys under -- its `skill-name` when it declares one, `consult-<slug>` otherwise. Because it resolves through the target rather than echoing the slug, an override on the target stays correct at every call site.
- `{skill:<slug>}` renders to the harness skill sigil plus the slug -- `/<slug>` on Claude, `!<slug>` on Rovo.
- `{subagent:<slug>}` renders to the harness subagent sigil plus the slug. That sigil is empty on both current harnesses, so it renders to the bare slug, which is how a subagent is dispatched on each.

Slugs are kebab-case and letter-led (`[a-z][a-z0-9-]*`). The sigils are a typed property of each harness in `HarnessConfig`, so a new harness must declare its own rendering or the build fails.

A token is also a dependency edge: `sync` extracts the tokens from a rulebook's, skill's, or subagent's include-expanded body and pulls each target into the deploy closure. An inline invocation is therefore expressed once, as the token -- it needs no duplicate `dependencies:` entry, and a token naming a non-existent artifact fails the run just as a missing `dependencies:` edge does. Because extraction runs on the include-expanded body, a token inside a shared `_partials` file becomes an edge for every artifact that inlines it.

Rulebooks, skills, and subagents all honor tokens; collections have no body to render. `{rulebook:<slug>}` has one restriction the others do not: It renders only where a declaration supplies the deployed rulebook set, which covers every body `sync` and `validate` render and excludes a support entry under `skills/`, since `install` ships one having resolved no declaration. A rulebook token in a support entry fails the run, as does one naming a rulebook that deploys no skill -- an `ambient`-only target is already in the reader's context, so there is nothing to route to. Express that relationship with `dependencies:` instead.

That boundary decides what a shared partial may contain. A partial inlined by both a skill body and a support entry cannot contain a `{rulebook:<slug>}` token: It renders in the skill but breaks the support entry's install. The pairing is live -- `skills/_data/recommendation-gradient.md` inlines `skills/_partials/option-format.md`, which skill bodies inline too.

Only `{rulebook:<slug>}` is checked for deployability. A `{skill:<slug>}` or `{subagent:<slug>}` token renders on every harness the body deploys to, including one its target does not: A skill that narrows itself with `supported-harnesses:` still renders an invocation elsewhere. Name such a skill only where the surrounding text already scopes it to that harness. _(Convention; not enforced.)_

Reserve a `dependencies:` entry for a non-inline edge; use a token for any invocation that appears in the body. _(Convention; not enforced.)_

## Links in rulebook bodies

A rulebook addresses a file by linking to it, not by naming it in prose. Author the target relative to the rulebook's own place in the content tree, which is `guidance/rulebooks/<slug>.md`, and `sync` emits the absolute path each target harness can follow. A target of `../../skills/_data/concision.md` resolves on Claude to `~/.claude/skills/_data/concision.md` and on Rovo to `~/.rovodev/skills/_data/concision.md`. Which root the path takes depends on which tree deploys the target: One naming a skill the same run delivers is anchored where that run wrote it, so `../../skills/consult-<slug>/SKILL.md` resolves on Claude under the project root from bare `sync`, and to `~/.claude/skills/consult-<slug>/SKILL.md` from `sync --global`. Every other target keeps the harness home in both domains, which is why the `_data/` example above reads the same either way. `{harness_home_dir}` and `{harness_id}` expand per harness, including where one opens a link target.

A rulebook may link only into `skills/` and `scripts/`, the two trees whose source layout matches where they deploy under every harness home. Any other target fails the run, with an error naming the rulebook, the target as authored, and why it was rejected. `subagents/` is rejected because a subagent is dispatched rather than read, so no link into one is worth authoring; `_partials/` and `collections/` never deploy as files, so a link into one would name nothing.

A rulebook inlines partials, which is how it receives shared doctrine, and that puts a constraint on a partial written for two kinds of host: A relative Markdown link cannot serve both a skill host and a rulebook host. A skill's links resolve against `<slug>/SKILL.md` in skills-dir space and a rulebook's against `guidance/rulebooks/<slug>.md` in content-root space, so one authored target names two different files. A skill-shaped target resolves outside a linkable root from a rulebook host and fails the run rather than shipping dead, but a partial meant for both hosts contains no relative link at all.

A link to a sibling rulebook is rejected too, and its error names the `{rulebook:<slug>}` token that addresses it instead. A rulebook is invoked rather than read: The skill it deploys is discovered by name, so an invocation resolves wherever it was deployed, while a path would be right in one domain and dead in the other. _(Validated on parse.)_

A target that is rooted correctly but names a file that has moved or been deleted is caught separately, by `content-link-resolution.unit.test.ts`, which also resolves a fragment on such a target to exactly one heading in the file it points into. _(Enforced by test.)_

One limitation is worth knowing before writing a rulebook that documents linking: Rewriting runs over the whole body, so a Markdown link inside a code fence or an inline code span is rewritten along with the rest. A rulebook cannot show a relative link verbatim as an example, and must describe the target instead. Invocation tokens rewrite the same way, so an example token keeps the `<slug>` placeholder rather than naming a real artifact.

## Anchor links

An anchor-only link addresses the body it appears in, so its fragment must name exactly one heading there. Naming none fails the run, and so does naming two: A locator that resolves by accident is not a locator. The rule covers every rulebook, skill, and subagent, and the guidance files `install` ships. _(Validated on parse.)_

Where the pipeline expands includes -- i.e., rulebooks, skills, subagents, and harness guidance -- the body checked is the expanded one, so an anchor authored in a `_partials/` file resolves against each artifact that inlines it, and the error names that artifact rather than the partial. A shared guidance file is checked as authored, since it inlines no partial.

Frontmatter, fenced code blocks (backtick or tilde), and inline code spans are exempt on both sides: A heading inside one provides no anchor, and a link inside one needs none. A code span _within_ a heading is the opposite case: It is part of that heading's text, so the heading still anchors, with the backticks dropped as punctuation -- ``### The `respond-to-review` path`` resolves to `#the-respond-to-review-path`. An indented code block is not exempt, because telling one from a nested list item would take block-level parsing, so show an example anchor in a fence or a code span. An anchor-only target is never rewritten, so unlike a relative one it survives either intact.

A fence nothing closes fails the run in its own right. Everything below it reads as code, so no anchor there can be checked, and a silent pass over an unchecked remainder is worse than a rejection. A closing fence repeats the opening character at least as many times, which is the rule a four-backtick example wrapping a three-backtick one depends on. _(Validated on parse.)_

A heading containing a token cannot be anchored: It renders to a different slug on each harness, so no single fragment addresses it everywhere. Give such a heading a token-free title where a link must address it. _(Validated on parse.)_

## Collections

A collection's only payload is a `members:` block -- the constituents it pulls into the deployed closure. List them per type (the same shape `dependencies:` uses), or use the computed token `'@library'` for every rulebook, skill, and subagent in the content root the collection belongs to -- i.e., the built-in library, or the owning source for a source collection:

```yaml
members:
  skills:
    - capture-feedback
  subagents:
    - canary
```

`members:` is collections-only; rulebooks, skills, and subagents use `dependencies:` instead. Declaring `dependencies:` on a collection, or `members:` on any other type, is an error. The resolver follows both keys identically -- the split is semantic: A collection contains members, an artifact depends on prerequisites.

A collection enumerates every member, not just its dependency roots. Roots-only membership would let an unexamined artifact enter through an edge and be treated as examined, which is the outcome the dispositions below exist to prevent.

### Dispositions

Declaring a collection is a claim about its members, so every artifact has at least one disposition recording the claims it is under; an artifact under none is an oversight rather than a decision. Membership is many-to-many -- i.e., the vetted collections may overlap -- and a collection outside this scheme is a plain bundle whose membership claims nothing: It neither satisfies coverage nor conflicts with any disposition. The two dispositions that assert an absence tolerate no conflicting claim: Standalone means membership in no collection, and triage excludes vetted membership. _(Enforced by `collection-dispositions.unit.test.ts`.)_

Deciding a disposition takes two reading passes, and the second is the one that gets skipped:

1. **Read the prose** for personal doctrine -- a preference stated as a rule that another team would answer differently.
2. **Ask what the artifact names that exists only here** -- a store, path, host, repository, tracker, or tool a consumer would not have. Such coupling appears in a default value or an example rather than in the prose, so the first pass misses it.

**A public collection** (`recommended` here) is one anyone may declare, so membership claims general fitness. Every criterion must hold:

- Nothing it names is specific to the author's environment.
- It states no personal doctrine.
- Its prerequisites appear where a reader looks before invoking, rather than appearing only on failure.
- Its closure contains only public members.
- It deploys where it works: An artifact that functions on one harness alone declares that harness rather than shipping everywhere under a general claim.

**A personal collection** (`williamthorsen` here) claims deliberate fit for one author rather than general fitness:

- It deliberately encodes that author's preferences, environment, or domain -- whatever disqualifies it from the public collection is what qualifies it here.
- Its closure contains only personal and public members.
- It is invoked often enough to justify a standing line in the skill index.

**Standalone** is membership in no collection: deliberate, declared directly where wanted, and recorded so the coverage check reads it as a decision rather than an omission. An artifact belongs here when it is deliberate but rarely invoked, or wanted only in specific projects. Every deployed skill costs a line in the skill index at every session, and a rarely-invoked artifact does not justify that cost.

**Triage** (`triage` here) contains what has not been examined. It is where new content starts, and it shrinks by promotion rather than growing.

A vetted collection is closed under its dependency edges, which is what makes the vetting real: Without closure, a vetted collection deploys unexamined content through an edge. Promoting an artifact therefore means promoting everything its closure contains. _(Enforced by `collection-dispositions.unit.test.ts`.)_

## Frontmatter fields

- **Rulebooks:** `slug`, optional `description`, optional `delivery` (`ambient`, `hook`, `skill`, or a non-empty list of them; defaults to `ambient`), optional `skill-name`, optional `version`.
- **Skills:** `name`, `description`, optional `user-invocable` (defaults to `true`), optional `supported-harnesses` (a harness id or list restricting deployment to those harnesses; absent deploys to all).
- **Subagents:** `name`, `description`, `tools`, optional `maxTurns`, optional `skills` (skills injected into the subagent's context), optional `rulebooks` (rulebooks injected the same way, named by slug rather than by deploy name, so a `skill-name` override on the target stays correct). `sync` pulls both lists into the deploy closure, merges each injected rulebook's deploy name into the deployed `skills:`, and drops the `rulebooks:` key from what it writes.
- **Collections:** `name`, `description`, and a `members:` block -- the collection's only payload.

Only the rulebook row is validated on parse; a `members:` block is validated wherever it appears. The other rows are read leniently: A field a deploy pass consumes takes effect, and an absent one falls back to a default rather than failing, so a skill with no `description` appears in Rovo's prompt index with an empty one. _(Convention; not enforced.)_

## Naming

A `delivery: skill` rulebook ships as `consult-<slug>`.

Skill names are verb-led. Order list members and frontmatter lists alphabetically unless there is a reason to group otherwise. _(Conventions; not enforced.)_

A `codeassembly-` prefix marks guidance for working in the CodeAssembly repository itself, as this specification does. Its absence marks content that applies in any project, CodeAssembly's own behavior included where a consumer meets it. Prefix a new artifact only when a project that merely consumes the library would have no use for it. _(Convention; not enforced.)_

## Skill-local reinforcement

Behavioural rules for an agent's output -- such as the recommendation gradient and the action-items block -- are stated once in `AGENTS.md` and the shared `_data` specs. Where the boundary below requires a restatement, put it at the step that produces the output: as a pointer in the skill body, or as a rendered example inlined from `_partials/`. An agent follows a rule more reliably when the rule appears next to the action it applies to than when the agent must follow a link to read it, and it imitates a nearby concrete example more reliably still than it follows a directive.

Treat that restatement as load-bearing redundancy, not duplication, where the rule specifies an output shape the agent must reproduce: Stripping the skill-local pointers there leaves the agent to improvise the block instead of copying it. Where the agent can follow the rule from a single statement, extend it to skill-local surfaces after that statement has been seen to fail, not in anticipation. _(Enforced for the specs named above by `action-item-reinforcement.unit.test.ts` and `spec-inlining.unit.test.ts`.)_

Where a step's guidance is a matter of local taste rather than library doctrine -- such as a user's code-style preferences, or a project's own glossary -- neither restatement above fits: A pointer sends the agent away to fetch the rule, and an inlined partial fixes one answer for every consumer at authoring time. Declare a guidance hook instead, `<!-- guidance-hook: <name> -->`, and leave the slot for a `codeassembly.yaml` to bind per project or per machine. An unbound hook contributes nothing to deployed output, so declaring one is safe wherever nothing fills it. A rulebook written for that slot declares `delivery: hook`, which records the route and lets `sync` report a binding and a delivery that disagree. The directive grammar is specified in `content/_partials/README.md` and the binding syntax in `packages/agents/README.md`. _(Convention; not enforced.)_

## Injection-point placement

Injected content brings its own headings: a partial's as authored, and a guidance-hook fill's demoted one level, so a bound rulebook's title appears at `##`. A host heading following a directive that is deeper than the injected content's shallowest heading renders as a subsection of the injection rather than of the host -- and for a hook, under whichever rulebook the local binding supplied, so one body reads differently on two machines.

Place every directive where the next host heading sits at or above that level. Where a section would otherwise nest, promote it or move the directive below it. The level that decides is what the injection contributes, not a fixed `##`: A partial opening at `###` and declaring no hook legitimately takes `###` siblings after it. _(Enforced by `injection-point-placement.unit.test.ts`.)_
