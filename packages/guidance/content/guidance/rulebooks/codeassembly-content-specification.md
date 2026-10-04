---
slug: codeassembly-content-specification
description: The declaration contract and authoring doctrine for CodeAssembly skills, subagents, rulebooks, and collections -- frontmatter, dependencies, invocation tokens, how broad a guidance change goes, and when a procedure belongs in a helper.
delivery: skill
version: '27'
---

# CodeAssembly content specification

The declaration contract for CodeAssembly artifacts -- skills, subagents, rulebooks, and collections. (Here "artifact" means an authored library item, not a generated output like a review or devlog.)

## Enforcement

Every rule below belongs to one of three classes, marked where it appears.

**Validated on parse.** A malformed `slug` or `skill-name`, a `delivery` value outside `ambient`/`hook`/`skill`, an empty `delivery` list, an unknown artifact-type key, a non-list value under one, and a `members:` block on anything but a collection each fail the run with an error naming the source file. Seven more fail outside the parser: a token naming an artifact that does not exist fails the run with an error naming the slug and the directories searched, whether it names that artifact as a dependency or optionally; a rulebook link target outside a linkable root fails the run before anything is written; a rulebook token naming a target that does not deploy a skill to invoke fails the same pre-write pass, and so does a rulebook token written in the optional form, which does not have a name to render; an anchor-only link target that does not name any heading in its own body fails wherever that body is rendered or installed, and so does a code fence that nothing closes; and a harness that does not declare a sigil is a type error at its `HarnessConfig` literal, so the build fails.

**Enforced by `validate`.** `codeassembly validate` checks a content root against these rules without deploying it. Such a rule names `validate`.

**Convention.** The rest is marked _(Convention; not enforced.)_ Nothing checks it.

## Declaring dependencies

When a rulebook, skill, or subagent relies on another -- such as a skill that invokes another skill, or a subagent that calls a skill without injecting it -- declare the edge in its frontmatter `dependencies:` block, grouped by type:

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

- `{rulebook:<slug>}` renders to the harness skill sigil plus the skill name under which the named rulebook deploys -- its `skill-name` when it declares one, `consult-<slug>` otherwise. Because it resolves through the target rather than copying the slug, an override on the target stays correct at every call site.
- `{skill:<slug>}` renders to the harness skill sigil plus the slug -- `/<slug>` on Claude, `!<slug>` on Rovo.
- `{subagent:<slug>}` renders to the harness subagent sigil plus the slug. That sigil is empty on both current harnesses, so it renders to the bare slug, which is how a subagent is dispatched on each.

Slugs are kebab-case and letter-led (`[a-z][a-z0-9-]*`). The sigils are a typed property of each harness in `HarnessConfig`. A new harness must declare its own rendering or the build fails.

A token is also a dependency edge: `sync` extracts the tokens from a rulebook's, skill's, or subagent's include-expanded body and pulls each target into the deploy closure. An inline invocation is therefore expressed once, as the token -- it does not need a duplicate `dependencies:` entry, and a token naming a non-existent artifact fails the run just as a missing `dependencies:` edge does. Because extraction runs on the include-expanded body, a token inside a shared `_partials` file becomes an edge for every artifact that inlines it.

A skill or subagent token has an optional form, marked `?` before the colon: `{skill?:<slug>}` and `{subagent?:<slug>}`. It renders exactly as the required form does, so an invocation reads the same wherever the target deploys. Its target must still exist: `sync` resolves one, and a rename or a deletion fails the run. Because it does not contribute an edge, the target deploys only if a declaration reaches it another way. Use it when a body names an artifact that a consumer may not want, such as a platform delegate for an ecosystem not used by the consumer.

`{rulebook?:<slug>}` fails the run: A rulebook token renders the skill name under which its target deploys, and an undeployed target supplies that name nowhere. `dependencies:` does not have an optional counterpart, because a frontmatter entry exists to pull an artifact in; a body that names one without pulling it in is the only case that the marker addresses. A content root declares content format 2 if any body that it contains, a `_partials` file included, uses an optional token. _(Enforced by `validate`.)_

A support entry under `skills/` does not contribute an edge: It is linked to rather than inlined, so `sync` never reads it. Each skill or subagent that links into the section containing a required `{skill:<slug>}` or `{subagent:<slug>}` token declares its target under `dependencies:`. An optional token there is exempt, since asserting the target may be absent is the opposite of guaranteeing its presence. The requirement depends on the fragment: A bare link to the file does not have a requirement, and a link to an enclosing heading has the requirements of its subsections. _(Enforced by `validate`, which also reports a support-entry token naming an artifact that the content root does not contain, optional or required.)_

Rulebooks, skills, and subagents all support tokens; collections do not have a body to render. `{rulebook:<slug>}` has one restriction that the others do not: It renders only if a declaration supplies the deployed rulebook set, which is true for every body that `sync` and `validate` render but not for a support entry under `skills/`, since a source's support entries deliver to every consumer of the source, whichever rulebooks that consumer declares. A rulebook token in a support entry fails the run, as does one naming a rulebook that does not deploy a skill -- an `ambient`-only target is already in the reader's context, so there is nothing to invoke. Express that relationship with `dependencies:` instead.

That boundary decides what a shared partial may contain. A partial inlined by both a skill body and a support entry cannot contain a `{rulebook:<slug>}` token: It renders in the skill but breaks the support entry's delivery.

Only `{rulebook:<slug>}` is checked for deployability. A `{skill:<slug>}` or `{subagent:<slug>}` token renders on every harness to which the body deploys, including one to which its target does not deploy: A token naming a skill that narrows itself with `supported-harnesses:` still renders an invocation elsewhere. Name such a skill only where the surrounding text already scopes it to that harness. _(Convention; not enforced.)_

Reserve a `dependencies:` entry for a non-inline edge; use a token for any invocation that appears in the body. _(Convention; not enforced.)_

## Links in rulebook bodies

A rulebook addresses a file by linking to it, not by naming it in prose. Author the target relative to the rulebook's own place in the content tree, which is `guidance/rulebooks/<slug>.md`, and `sync` emits the absolute path that each target harness can follow. A target of `../../skills/_data/concision.md`, in a rulebook from the source named `codeassembly-guidance`, resolves from `sync --global` on Claude to `~/.claude/skills/_sources/codeassembly-guidance/_data/concision.md` and on Rovo to `~/.rovo/skills/_sources/codeassembly-guidance/_data/concision.md`. Which root the path takes depends on the tree into which the target is deployed, which is the deploying domain in both cases: One naming a skill delivered by the same run is anchored where that run wrote it, so `../../skills/consult-<slug>/SKILL.md` resolves on Claude under the project root from bare `sync`, and to `~/.claude/skills/consult-<slug>/SKILL.md` from `sync --global`. Every other target resolves into the owning source's support namespace, `skills/_sources/<name>/`, under the project root from bare `sync` and under the harness home from `sync --global`. `{harness_home_dir}` and `{harness_id}` expand per harness, including where one opens a link target.

A rulebook may link only into `skills/` and `scripts/`, the two trees whose source layout matches where they deploy under every harness home. Any other target fails the run, with an error naming the rulebook, the target as authored, and why it was rejected. `subagents/` is rejected because a subagent is dispatched rather than read, so a link into one is not worth authoring. `_partials/` and `collections/` never deploy as files. A link into one would name nothing.

A rulebook inlines partials, which is how it receives shared doctrine, and that puts a constraint on a partial written for two kinds of host: A relative Markdown link cannot serve both a skill host and a rulebook host. A skill's links resolve against `<slug>/SKILL.md` in skills-dir space and a rulebook's against `guidance/rulebooks/<slug>.md` in content-root space. One authored target names two different files. A skill-shaped target resolves outside a linkable root from a rulebook host and fails the run rather than deploying as a broken link, but a partial meant for both hosts does not contain any relative link at all.

A link to a sibling rulebook is rejected too, and its error names the `{rulebook:<slug>}` token that addresses it instead. A rulebook is invoked rather than read: The skill that it deploys is discovered by name, so an invocation resolves wherever it was deployed, while a path would be right in one domain and broken in the other. _(Validated on parse.)_

A target that is rooted correctly but names a file that has moved or been deleted is caught separately, by `validate`, which looks for the file in the content root, and resolves a fragment on such a target to exactly one heading in the file into which it points. _(Enforced by `validate`.)_

One limitation is worth knowing before writing a rulebook that documents linking: Rewriting runs over the whole body, so a Markdown link inside a code fence or an inline code span is rewritten along with the rest. A rulebook cannot show a relative link verbatim as an example, and must describe the target instead. Because invocation tokens are rewritten the same way, an example token keeps the `<slug>` placeholder rather than naming a real artifact.

## Anchor links

An anchor-only link addresses the body in which it appears. Its fragment must name exactly one heading there. Naming none fails the run, and so does naming two: A locator that resolves by accident is not a locator. The rule covers every rulebook, skill, and subagent, and the guidance files that `install` deploys. _(Validated on parse.)_

In every artifact whose includes the pipeline expands -- i.e., rulebooks, skills, subagents, and harness guidance -- the body checked is the expanded one, so an anchor authored in a `_partials/` file resolves against each artifact that inlines it, and the error names that artifact rather than the partial. A shared guidance file does not have a check of its own: The pipeline reads it only through the harness guidance that inlines it, and checks an anchor that it contains against that expanded body.

Frontmatter, fenced code blocks (backtick or tilde), and inline code spans are exempt on both sides: A heading inside one does not provide an anchor, and a link inside one does not need an anchor. A code span _within_ a heading is the opposite case: Because it is part of that heading's text, the heading still provides an anchor, with the backticks dropped as punctuation -- ``### The `respond-to-review` path`` resolves to `#the-respond-to-review-path`. An indented code block is not exempt, because telling one from a nested list item would take block-level parsing. Show an example anchor in a fence or a code span. An anchor-only target is never rewritten, so unlike a relative one it survives either intact.

A fence that nothing closes fails the run in its own right. Everything below it reads as code. The pipeline cannot check any anchor there, and a silent pass over an unchecked remainder is worse than a rejection. A closing fence repeats the opening character at least as many times, which is the rule on which a four-backtick example wrapping a three-backtick one depends. _(Validated on parse.)_

A heading containing a token cannot be anchored: It renders to a different slug on each harness, so a single fragment cannot address it on every harness. Give such a heading a token-free title if a link must address it. _(Validated on parse.)_

## Collections

A collection's only payload is a `members:` block -- the constituents that it pulls into the deployed closure. List them per type (the same shape that `dependencies:` uses), or use the computed token `'@library'` for every rulebook, skill, and subagent in the content root to which the collection belongs, the source from which it resolved:

```yaml
members:
  skills:
    - capture-feedback
  subagents:
    - canary
```

`members:` is collections-only; rulebooks, skills, and subagents use `dependencies:` instead. Declaring `dependencies:` on a collection, or `members:` on any other type, is an error. The resolver follows both keys identically -- the split is semantic: A collection contains members, an artifact depends on prerequisites.

## Frontmatter fields

- **Rulebooks:** `slug`, optional `description`, optional `delivery` (`ambient`, `hook`, `skill`, or a non-empty list of them; defaults to `ambient`), optional `skill-name`, optional `version`. A declared `version` is an opaque string, never parsed as semver, and every route that delivers the rulebook names it on a `<!-- rulebook-version: <version> -->` line directly below the marker that names the slug, so that an agent can read which version of a rulebook it has. A route omits the line for a rulebook that does not declare a version. Quote the value: YAML reads an unquoted `1.10` as the number `1.1`, and the schema rejects a non-string rather than deploying the digits that it lost. It rejects a value that the version line cannot contain on its own, which is a blank one, a multi-line one, and one containing `-->`.
- **Skills:** `name`, `description`, optional `user-invocable` (defaults to `true`), optional `supported-harnesses` (a harness id or list restricting deployment to those harnesses; absent deploys to all).
- **Subagents:** `name`, `description`, optional `tools`, optional `disallowedTools`, optional `maxTurns`, optional `skills` (skills injected into the subagent's context), optional `rulebooks` (rulebooks injected the same way, named by slug rather than by deploy name, so that a `skill-name` override on the target stays correct). `sync` pulls both lists into the deploy closure, merges each injected rulebook's deploy name into the deployed `skills:`, and drops the `rulebooks:` key from what it writes.
- **Collections:** `name`, `description`, and a `members:` block -- the collection's only payload.

A subagent's tool grant is either named or inherited. `tools` names the grant outright; a subagent that omits it inherits the harness's whole subagent tool pool, and `disallowedTools` then removes names from whatever pool results. Use inheritance when the subagent needs a tool that an allowlist cannot name -- an MCP tool whose name varies by machine -- and weigh the consequence: A denylist names tools the same way an allowlist does, so it removes the listed names and nothing else. The residual grant is whatever the machine supplies, and the subagent's own instructions limit the rest. Choose inheritance when that residual is acceptable, and name a `tools` allowlist when it is not. Claude applies the denylist. Rovo does not read it, and its overlay names a `tools` allowlist for every subagent, so a subagent relying on inheritance states its Rovo grant in that overlay. _(Convention; not enforced.)_

Only the rulebook row is validated on parse; a `members:` block is validated wherever it appears. The other rows are read leniently: A field consumed by a deploy pass takes effect, and an absent one falls back to a default rather than failing. A skill without a `description` appears in Rovo's prompt index with an empty one. _(Convention; not enforced.)_

### Version bumps

A rulebook's `version` tracks the operative content of its deployed body: Bump it whenever an edit changes what the rulebook asks of an agent, and leave it when the edit was cosmetic. The field exists to prevent two different bodies from reporting one version. `revise-prose` does not key a repository's sweep coverage on it: Coverage follows each rule's sweep version, as "Declaring rule ids and sweep versions" below states.

The deployed body is the body after includes expand. Editing a partial is therefore a content change for every rulebook that includes it, and the version changes although the rulebook's own file is untouched. A file that the body links to rather than inlines, such as a `_data/` reference, is outside the body and does not require a bump. _(Convention; not enforced.)_

A `revise-prose` repair does not change what a rulebook asks, because the sweep's calibration rules out any rewrite that would change what the text directs. Keep the rulebook's `version` and each rule's sweep version, and re-pin only the hashes that changed: Once a rule's sweep version rises, `revise-prose` no longer counts that rule's coverage, including the coverage that the same sweep recorded. _(Convention; not enforced.)_

## Naming

A `delivery: skill` rulebook deploys as `consult-<slug>`.

A rulebook slug's final segment names the kind of document rather than its subject. This library uses `-conventions`, `-policy`, `-preferences`, and `-specification`; other content roots add `-guidance`, `-guide`, `-references`, and `-settings`. The set is open, and `-rulebook` is the fallback when the document does not fit any kind noun. _(Convention; not enforced.)_

Skill names are verb-led. Order list members and frontmatter lists alphabetically unless there is a reason to group otherwise. _(Conventions; not enforced.)_

## Adding guidance

Correct a behavior at the fewest surfaces that plausibly account for it, deploy that change, and observe. Extend to further surfaces only after the minimal change has been seen to fail. Changing every contributing surface at once means that the improvement cannot be credited to any single edit, so the cheapest sufficient fix is never learned, and each surface touched permanently adds tokens to every later invocation.

A proposal justifies its breadth rather than assuming it. A contributing surface left unaddressed is recorded as an observation for a later pass rather than offered as an option to adopt now. Before adding exposition to a rulebook, check whether its existing examples already teach the point. _(Convention; not enforced.)_

Before making any change to a guidance file, identify whether the new text makes any existing text redundant (whether in that file or any other) and trim the redundancy in the same change. If the file is larger after the change than before, offer to run {skill:streamline-guidance} against it. _(Convention; not enforced.)_

## Procedures in helpers

A step whose result is fixed by its inputs belongs in a helper that emits JSON, and the skill or subagent invokes the helper and reads its output. Such steps include parsing a file or a command's output, walking a fallback cascade, matching by pattern or timestamp, and converting a format. A prose description of such a step is a copy that the agent re-executes on every run, and it drifts from any helper that performs the same step. Judgment stays in prose: choosing among options, composing text, and deciding what a result means.

A step that mixes the two splits at that boundary: The helper performs the deterministic part and returns its result, or the candidates among which the agent chooses, and the choice stays in the skill.

When authoring or editing a skill or subagent, move such a procedure in the text being changed into a helper as part of the same change. First check whether an existing helper already performs it, and extend that helper rather than writing a second one. A procedure found outside the text being changed follows the [scope doctrine](../../skills/_data/scope-and-deferral.md) rather than prompting a sweep of the library. A content root declares its helpers under `helpers:` in its `codeassembly-content.yaml`. _(Convention; not enforced.)_

## Declaring rule ids and sweep versions

A rulebook written for the `comment-preferences` or `writing-preferences` hook is a unit of the `revise-prose` sweep, and it declares an id and a sweep version for each rule that it states. The declaration is a `<!-- rule: <id> <version> -->` marker on the first non-blank line under the rule's `##` heading; a rule stated in an included partial has its marker in the partial. The sweep records coverage and rejections under the id, and `prose-reviser` reports each site under it; therefore, an id stays as written when its heading changes. Take a new rule's id from the kebab-case form of its heading.

The marker declares the rule whether or not a detector covers it: The helper's registry alone decides which rules it detects. A rulebook that declares one id declares one under every `##` heading, and each id is declared only once across the content root. _(Convention; not enforced.)_

A sweep version is a positive integer, and a new rule starts at `1`. Raise it when some text that complied with the rule's old wording could fail the new one, including through an edit outside every rule section, such as to a rulebook's introduction, and raise it when unsure. Leave it for a relaxation, a clarification, or a rewording. The `plain-speech` unit's `unit-version` follows the same test. A raised sweep version re-opens that rule's coverage and rejections in every repository's record, and a rulebook `version` change re-opens none. Because a rule that becomes stricter changes what its rulebook asks, the rulebook's `version` rises with every sweep-version rise. _(Convention; not enforced.)_

## Guidance hooks

When a step's guidance is a matter of local taste rather than library doctrine -- such as a user's code-style preferences, or a project's own glossary -- neither a pointer to a stated rule nor an inlined partial fits: A pointer sends the agent away to fetch the rule, and an inlined partial fixes one answer for every consumer at authoring time. Declare a guidance hook instead, `<!-- guidance-hook: <name> -->`, and leave the slot for a `codeassembly.yaml` to bind per project or per machine. An unbound hook contributes nothing to deployed output, so declaring one is safe wherever nothing fills it. A rulebook written for that slot declares `delivery: hook`, which records the route and lets `sync` report a binding and a delivery that disagree. The directive grammar is specified in `content/_partials/README.md` and the binding syntax in `packages/agents/docs/project-declaration.md`. _(Convention; not enforced.)_

## Injection-point placement

Injected content contributes its own headings: a partial's as authored, and a guidance-hook fill's demoted one level, so a bound rulebook's title appears at `##`. If a host heading follows a directive and is deeper than the injected content's shallowest heading, it renders as a subsection of the injection rather than of the host. For a hook, it renders under whichever rulebook the local binding supplied, which makes one body read differently on two machines.

Place every directive where the next host heading is at or above that level. If a section would otherwise nest, promote it or move the directive below it. The level that decides is what the injection contributes, not a fixed `##`: A partial that opens at `###` and does not declare a hook legitimately takes `###` siblings after it. _(Enforced by `validate`.)_
