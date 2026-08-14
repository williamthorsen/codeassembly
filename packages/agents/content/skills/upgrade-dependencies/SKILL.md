---
name: upgrade-dependencies
description: Use when upgrading, updating, or bumping dependencies in any project managed by package.json. Covers routine patch/minor updates, major version migrations, security vulnerability remediation, and peer dependency conflict resolution.
user-invocable: true
---

# Upgrade dependencies

Structured process for autonomously upgrading dependencies in a project managed by `package.json`.

**Core principle:** Assess before acting. Understand the full scope, triage by risk, execute incrementally, and trust no green signal you have not verified end to end.

The skill is package-manager-agnostic. Commands are named by role ("the PM's outdated report"), with one concrete form shown as an example where that helps; the example illustrates the role, it never defines it. Ecosystem facts (which endpoint works, which plugin is compatible) go stale; when a mechanic is PM-specific or time-sensitive, resolve it at execution time from the channels in [Resolving specifics](#resolving-specifics).

## Workflow

### 1. Detect

Identify the environment before assessing:

- **Package manager** — from the lockfile: `pnpm-lock.yaml` → pnpm, `package-lock.json` → npm, `yarn.lock` → yarn, `bun.lock`/`bun.lockb` → bun. Use that PM's commands for every query, install, and audit below.
- **Workspace layout** — single package or monorepo (workspace globs in `package.json`, `pnpm-workspace.yaml`, or the PM's equivalent). In a monorepo, every step fans out across all workspaces, never the root alone.
- **Support policy** — the project's own commitments: Node floor (`engines`, `.nvmrc`, CI matrix), published peer ranges, runtime targets. These bound every upgrade; changing one is a consumer-facing decision, not a side effect.
- **Project scripts** — read `package.json` for the actual build/test/lint script names. Never assume generic names.
- **Update tooling** — note any update-automation config (ncu/`.ncurc`, renovate, dependabot). Any pin made later must be mirrored there.

### 2. Assess

Before touching anything:

- **Read the full outdated report.** Run the PM's recursive outdated report (e.g. `pnpm outdated --recursive`) and read every row. Never truncate, page, or sample it; a hidden row is an upgrade that resurfaces as a surprise at final verification.
- **Check vulnerabilities — and verify the check ran.** Run the PM's audit command and confirm it actually returned results. Audit endpoints get retired out from under PMs (pnpm's audit endpoint, for one), so a failing audit channel is a lookup problem, not a reason to skip: Fall back to the project's own audit tooling, the registry's advisory API, or an independent vulnerability scanner. Prioritize whatever the working channel reports.
- **Inspect ceilings before installing.** For each planned upgrade, read the registry metadata first: `<pm> view <pkg> peerDependencies engines peerDependenciesMeta`. A ceiling is anything that caps a package below latest: a transitive peer pin on a foundation package, an `engines.node` requirement above the project's floor, or the project's own support policy. Finding ceilings now shapes the plan; finding them mid-install produces thrash.
- **Check whether a "required" peer is optional.** Before adding a peer the upgrade appears to demand, read `peerDependenciesMeta`: An optional peer is satisfied transitively, produces no unmet-peer warning, and needs no manifest entry in a project that does not use it directly.
- **Recall prior learnings.** If a knowledge store is registered, invoke `{skill:kb-retrieve-events}` for events touching the packages and tools in scope; past upgrades often recorded the exact ceiling, shim, or retired endpoint you are about to rediscover. Skip this step when no store is configured.

### 3. Triage

| Category                     | Risk   | Action                                            |
| ---------------------------- | ------ | ------------------------------------------------- |
| **Security** (advisory hits) | Urgent | Fast-track in dedicated PR                        |
| **Patch** (x.y.Z)            | Low    | Batch together                                    |
| **Minor** (x.Y.0)            | Medium | Check changelog first, then batch with patches    |
| **Major** (X.0.0)            | High   | Individual evaluation — research before upgrading |

Check changelogs for ALL updates, not just majors. Behavioral changes hide in minor bumps.

Three triage judgments go beyond the version-number table:

- **Ceilings are policy, not just conflicts.** The target for each package is the highest version compatible with the project's support policy, not merely the highest that installs without a dependency-vs-dependency conflict. A pin can be forced by the Node floor, by a transitive peer cap, or by a single package's `engines`; each is a deliberate ceiling, and a ceiling that would move the project's own support policy (e.g. raising the Node floor) is a consumer-facing breaking change to decide, not a technicality to absorb.
- **Identify cohorts.** Interdependent majors whose peer constraints reference each other (a linter major and its plugin majors, a framework and its adapter) cannot land separately: Any split leaves an uninstallable intermediate state. Treat such a cohort as a single unit through planning, execution, and commit.
- **Watch for abandoned-at-latest packages.** The outdated report cannot reveal a package that is simultaneously "latest" and broken under the new major of its host (it calls an API the host removed). Only running the target major surfaces these: After any major runtime, framework, or linter bump, run the tool and watch for removed-API errors, and expect the remedy to be migrating to a maintained fork rather than any version bump.

### 4. Plan

**Scope:**

- Security fixes: always a dedicated fast-track PR.
- Patches/minors: Batch in one PR.
- Majors: If 2 or fewer, include in the same PR as sequential commits; if more, separate PR per major.

**Execution order** — follow the dependency graph, foundations first:

1. Language/runtime types (`typescript`, `@types/node`)
2. Frameworks (`react`, `next`, `vue`)
3. Framework dependents (`react-router`, `@mui/material`)
4. Tooling (`eslint`, `prettier`, `vitest`)
5. Leaf dependencies

**Commit granularity:** One major per commit for bisectability — except a cohort, which lands as one atomic commit because no smaller step is installable.

**Plan every pin twice.** A package held below latest carries two obligations: a recorded rationale (in the commit body or ticket, so a future maintainer can tell a deliberate ceiling from an oversight) and a matching cap in the update tooling (ncu filter, renovate/dependabot ignore rule) so the next automated bump does not silently revert it.

### 5. Execute

For each dependency or batch, install with the PM's add command at an explicit version (e.g. `pnpm add -D <pkg>@<version>`; use the PM's workspace flags to target the right workspace), then verify with the project's own quality-gate scripts before moving on.

**Major-upgrade pre-flight — before installing:**

1. Read the migration guide and changelog.
2. Check for official codemods and run them before making manual changes.
3. Verify downstream packages support the new major (registry metadata, changelogs).

**Peer dependency conflicts** come in two kinds; distinguish them before acting:

- **Genuine incompatibility:** The package really does not support the new version. Resolve the actual conflict — upgrade the conflicting packages to compatible versions, or hold the upgrade at the ceiling. Never mask it with dependency overrides, legacy-peer-deps behavior, or disabling strict peer checks.
- **Ecosystem lag:** The declared peer range excludes the new major, but the package works because it shims the removed APIs internally. Verify which kind you have by inspecting the package's use of the removed API (does its code path call the removed method, or route through a compat layer?). Clear a confirmed false positive through the PM's sanctioned allowance mechanism — pnpm's is `pnpm.peerDependencyRules.allowedVersions`; find the current PM's equivalent in its docs — scoped to the specific package and range, never via blanket suppression.

**Fork and successor swaps preserve the public surface.** When an abandoned package is replaced by a maintained fork, the swap can rename what consumers reference (rule namespaces, export names). Keep the old surface working — remap old names to new via the project's config or an adapter — so downstream consumers' overrides and references survive the swap.

**Curate new recommended rules per rule.** A linter or plugin major typically grows its recommended set, flagging existing code. Decide adopt (fix the code) versus disable (in config, with a note) for each new rule against the project's philosophy. Neither blanket adoption nor blanket suppression is a decision.

### 6. Verify

A green signal is only as good as what it exercised. Each check below exists because a plausible green light can be wired to the wrong sensor:

- **Force a clean, non-cached run** of the full quality gate (build + type-check + test + lint). An incremental "no changes, skipping" pass proves nothing about the new versions. Confirm every referenced lint rule id resolves — flat-config linters throw on unknown rule ids even for rules set to `off`.
- **Rebuild before self-hosted checks.** When a repo checks itself with its own compiled output (a config package linting itself with its own config), rebuild first or the check runs against stale output.
- **Smoke-test opt-in surfaces.** A self-linting config package exercises only its default config path; instantiate each optionally-loaded config under the new major, since the configs the host repo does not use are the ones most at risk.
- **Re-run the outdated report and enumerate the pins.** The end state is exactly N intentional pins, each with its recorded rationale and its matching update-tooling cap. Anything below latest without both is unfinished work, not an acceptable remainder.
- **Re-run the vulnerability check** through the channel verified in Assess.
- **Check root↔workspace alignment** in a monorepo: A root-only bump leaves workspaces on the old version; confirm the same dependency resolves to aligned versions across workspaces.
- **Assess consumer impact for published packages.** If an upgrade raised the package's effective engine or peer requirements, that narrowing is a breaking change for consumers: Plan a major release with matching `peerDependencies` updates, marked per the project's breaking-change convention.

### 7. Commit and capture

One commit per logical change (a cohort is one logical change), each leaving the repo green. Follow the `{skill:commit}` conventions with the `deps` work type, and put each pin's rationale in the body of the commit that introduces it.

If a knowledge store is registered, invoke `{skill:capture-event}` for each ecosystem fact discovered the hard way — a retired endpoint, a shim that clears an unmet-peer false positive, a fork swap, a ceiling and its reason — so the next upgrade recalls it instead of rediscovering it. Skip when no store is configured.

## Resolving specifics

Ecosystem facts go stale; these channels do not. When guidance in this skill disagrees with what a channel reports, trust the channel.

- **Registry metadata** — `<pm> view <pkg> peerDependencies engines peerDependenciesMeta versions`: the authoritative source for ceilings, peer ranges, and optionality.
- **Changelogs, release notes, and migration guides** — fetch via available web tools; the package's repository and documentation site are the sources for behavioral changes and codemods.
- **The package manager's documentation** — the sanctioned mechanism for peer allowances, workspace fan-out flags, and audit alternatives is PM-specific and changes across PM majors; look it up rather than assuming.
- **Official codemods** — check the framework or tool's migration guide for a codemod before planning manual edits.
- **The knowledge store** — prior upgrade events, when a store is registered.

## Common mistakes

| Mistake                                       | Fix                                                                    |
| --------------------------------------------- | ---------------------------------------------------------------------- |
| Skip the vulnerability check when audit fails | A dead audit channel is a lookup problem — fall back, never skip       |
| Truncate the outdated report                  | Read every row; hidden rows resurface at final verification            |
| Skip changelogs for minors                    | Behavioral changes hide in minor bumps                                 |
| Batch unrelated majors in one commit          | One major per commit for bisectability                                 |
| Split a cohort to honor one-major-per-commit  | A cohort is one atomic commit; any split is uninstallable              |
| Run the PM's blanket latest-update command    | Ignores semver ranges and pulls unplanned majors                       |
| Use interactive flags                         | Requires human input — breaks autonomous operation                     |
| Suppress peer warnings with overrides         | Verify shim-vs-break, then use the PM's sanctioned allowance mechanism |
| Pin without capping the update tooling        | The next automated bump silently reverts an uncapped pin               |
| Trust a cached green run                      | Force a clean run; confirm the gate exercised the new versions         |
| Blanket-adopt or blanket-suppress new rules   | Decide adopt vs disable per rule against the project's philosophy      |
| Assume generic script names (`pnpm build`)    | Read `package.json` for the project's actual script names              |
