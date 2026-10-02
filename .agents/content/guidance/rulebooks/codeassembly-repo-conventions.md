---
slug: codeassembly-repo-conventions
description: Conventions for authoring content in the CodeAssembly repository itself -- the library's own tests, collection dispositions, sweep doctrine, skill-local reinforcement, and artifact naming.
delivery: skill
version: '1'
---

# CodeAssembly repository conventions

These conventions supplement {rulebook:codeassembly-content-specification}, the contract for any content root, with the doctrine that applies to the library in this repository. A path below is relative to the library's content root, `packages/agents/content/`.

## Enforcement by test

The suites in `__tests__/` read the library's own content and assert its conventions hold. When one of them checks a rule, the rule names its test. A rule that holds for any content root is checked by `codeassembly validate` instead, which `library-validation.unit.test.ts` runs over the library; such a rule names `validate`.

Some rules in the specification read as conventions there, because nothing checks them in a consumer's root, but a library suite enforces them here:

- **Version bumps**, including the rise of a rulebook's `version` with every sweep-version rise: `rulebook-version-pins.unit.test.ts`, which pins each rulebook's deployed body and each rule's section against its version.
- **Rule ids and sweep versions**: `prose-sweep-vocabulary.unit.test.ts`, which requires a version on every rule marker and each id to be declared only once across the library.

## Collection dispositions

A collection enumerates every member, not just its dependency roots. Roots-only membership would let an unexamined artifact enter through an edge and be treated as examined, which is the outcome that the dispositions below exist to prevent.

Declaring a collection is a claim about its members, so every artifact has at least one disposition recording the claims that it is under; an artifact under none is an oversight rather than a decision. Membership is many-to-many -- i.e., the vetted collections may overlap -- and a collection outside this scheme is a plain bundle whose membership claims nothing: It neither satisfies coverage nor conflicts with any disposition. The two dispositions that assert an absence do not tolerate any conflicting claim: Standalone means that an artifact does not belong to any collection, and triage excludes vetted membership. An opt-in collection asserts an absence of its own: Nothing outside it reaches its members. _(Enforced by `collection-dispositions.unit.test.ts`.)_

Deciding a disposition takes two reading passes, and the second is the one that gets skipped:

1. **Read the prose** for personal doctrine -- a preference stated as a rule that another team would answer differently.
2. **Ask what the artifact names that exists only here** -- a store, path, host, repository, tracker, or tool that a consumer would not have. Such coupling appears in a default value or an example rather than in the prose, so the first pass misses it.

**A public collection** (`recommended` here) is one that anyone may declare, and membership in it claims general fitness. Every criterion must hold:

- Nothing it names is specific to the author's environment.
- It does not state any personal doctrine.
- Its prerequisites appear where a reader looks before invoking, rather than appearing only on failure.
- Its closure contains only public members.
- It deploys where it works: An artifact that functions on one harness alone declares that harness rather than deploying everywhere under a general claim.

**A personal collection** (`williamthorsen` here) claims deliberate fit for one author rather than general fitness:

- It deliberately encodes that author's preferences, environment, or domain -- whatever disqualifies it from the public collection qualifies it here.
- Its closure contains only personal and public members.
- It is invoked often enough to justify a standing line in the skill index.

**An opt-in collection** (`atlassian` here) claims fit to one vendor ecosystem rather than to one author or to everyone:

- Nothing outside it reaches its members: The closure of every other collection that enumerates its own members excludes them, so a consumer that does not declare it never deploys one.
- Its closure contains only opt-in and public members.
- A consumer declares it only if that vendor's products are in use, since each member takes a line in the skill index of every session.

The first criterion is enforced rather than observed, because a single invocation token restored to its required form would undo it silently. _(Enforced by `collection-dispositions.unit.test.ts`.)_

**Standalone** is the absence of any collection membership: deliberate, declared directly where wanted, and recorded so that the coverage check reads it as a decision rather than an omission. An artifact belongs here when it is deliberate but rarely invoked, or wanted only in specific projects. Every deployed skill takes a line in the skill index at every session, and a rarely-invoked artifact does not justify that line.

**Triage** (`triage` here) contains what has not been examined. It is where new content starts, and it shrinks by promotion rather than growing.

A vetted collection is closed under its dependency edges, which makes the vetting real: Without closure, a vetted collection deploys unexamined content through an edge. Promoting an artifact therefore means promoting everything its closure contains. _(Enforced by `collection-dispositions.unit.test.ts`.)_

## Shared partials

A partial inlined by both a skill body and a support entry cannot contain a `{rulebook:<slug>}` token, as the specification states under "Invocation tokens". The pairing is live in this library -- `skills/_data/recommendation-gradient.md` inlines `skills/_partials/option-format.md`, which skill bodies inline too.

## Changing the sweep's own doctrine

`revise-prose` delivers `_partials/plain-speech.md` and `_partials/plain-speech-calibration.md` inside the prompts of `skills/revise-prose/SKILL.md` and `subagents/prose-reviser.md`, so those files state a rule and exhibit it at once. Check an edit to any of them by running the sweep over that set on the branch, rather than by reading the diff for violations: A hand check reads what the author was already looking at, while the sweep reads each file whole against every rule.

Because a sweeper applies the doctrine deployed to its harness, deploy the content of a branch that edits the doctrine before sweeping that branch. If the deployed copy is behind the branch, sync the branch's content to the project tier first; if `live` already matches the branch, the deployed copy is the branch's and the sweep runs as it stands. _(Convention; not enforced.)_

## Rule-id calibration

`_partials/plain-speech-calibration.md` declares a rule of the `plain-speech` unit the same way that a rulebook declares one, with its marker under a `###` heading of its own, and `plain-speech-calibration.unit.test.ts` pins that marker with the rest of the calibration's text.

## Skill-local reinforcement

Behavioral rules for an agent's output -- such as the recommendation gradient and the action-items block -- are stated once in `AGENTS.md` and the shared `_data` specs. When the boundary below requires a restatement, put it at the step that produces the output: as a pointer in the skill body, or as a rendered example inlined from `_partials/`. An agent follows a rule more reliably when the rule appears next to the action to which it applies than when the agent must follow a link to read it, and it imitates a nearby concrete example more reliably still than it follows a directive.

Treat that restatement as necessary redundancy, not duplication, when the rule specifies an output shape that the agent must reproduce: Stripping the skill-local pointers there leaves the agent to improvise the block instead of copying it. If the agent can follow the rule from a single statement, extend it to skill-local surfaces after that statement has been seen to fail, not in anticipation. _(Enforced for the specs named above by `action-item-reinforcement.unit.test.ts` and `spec-inlining.unit.test.ts`.)_

## Naming

A `codeassembly-` prefix marks content about CodeAssembly itself -- its content format, its tool, or this repository -- as distinct from general engineering guidance. Its absence marks content that applies in any project. It is the library's naming convention for its own artifacts. _(Convention; not enforced.)_
