---
name: upgrading-dependencies
description: Use when upgrading, updating, or bumping Node.js/pnpm project dependencies. Covers routine patch/minor updates, major version migrations, security vulnerability remediation, and peer dependency conflict resolution.
user-invocable: true
---

# Upgrading Dependencies

Structured process for autonomously upgrading Node.js/pnpm project dependencies.

**Core principle:** Assess before acting. Understand the full scope, triage by risk, execute incrementally.

## Workflow

### 1. Assess

Before touching anything:

```bash
pnpm outdated --recursive    # Full scope of available updates
pnpm audit                   # Security vulnerabilities (prioritize these)
```

Also determine:

- **Node.js version** (`.nvmrc`, `engines`, CI config) — new deps may require newer Node
- **Project scripts** — read `package.json` for actual build/test/lint command names

### 2. Triage

| Category                       | Risk   | Action                                            |
| ------------------------------ | ------ | ------------------------------------------------- |
| **Security** (CVEs from audit) | Urgent | Fast-track in dedicated PR                        |
| **Patch** (x.y.Z)              | Low    | Batch together                                    |
| **Minor** (x.Y.0)              | Medium | Check changelog first, then batch with patches    |
| **Major** (X.0.0)              | High   | Individual evaluation — research before upgrading |

**Check changelogs for ALL updates, not just majors.** Minor versions can contain behavioral changes.

### 3. Plan

**Scope:**

- Security fixes: Always a dedicated fast-track PR
- Patches/minors: Batch in one PR
- Majors: If 2 or fewer, include in same PR as sequential commits; if more, separate PR per major

**Execution order** — follow the dependency graph, foundations first:

1. Language/runtime types (`typescript`, `@types/node`)
2. Frameworks (`react`, `next`, `vue`)
3. Framework dependents (`react-router`, `@mui/material`)
4. Tooling (`eslint`, `prettier`, `vitest`)
5. Leaf dependencies

### 4. Execute

**For each dependency or batch:**

```bash
pnpm add <package>@<version>       # runtime dep
pnpm add -D <package>@<version>    # dev dep
pnpm add -w <package>@<version>    # root workspace dep
```

Verify after each using the project's quality-gate scripts (check `package.json` — commonly named `check`, `check:strict`, `build`, `test`, or `lint`).

**For major upgrades — before running the install command:**

1. Read migration guide and changelog
2. Check for official codemods (e.g., `npx @next/codemod`, `npx react-codemod`)
3. Verify downstream packages support the new major
4. Run codemods before manual changes

**Peer dependency conflicts:** research the compatibility matrix. Upgrade conflicting packages to compatible versions. Follow anti-patterns — never use `pnpm.overrides`, `--legacy-peer-deps`, or `strict-peer-dependencies=false`.

### 5. Verify

After all upgrades:

```bash
pnpm outdated --recursive    # Only intentionally skipped majors remain
pnpm audit                   # No new vulnerabilities
```

Run the project's full quality gate (build + type-check + test + lint).

### 6. Commit

One commit per logical change. Each commit must leave the repo green. Follow the `commit` skill conventions with the `deps` work type.

## Common Mistakes

| Mistake                                | Fix                                                |
| -------------------------------------- | -------------------------------------------------- |
| Skip `pnpm audit` at start             | Always assess security posture first               |
| Skip changelogs for minors             | Behavioral changes hide in minor bumps             |
| Batch major upgrades in one commit     | One major per commit for bisectability             |
| Use `pnpm update --latest` blindly     | Ignores semver ranges, pulls unplanned majors      |
| Use `--interactive` flag               | Requires human input — breaks autonomous operation |
| Suppress peer dep warnings             | Resolve the actual conflict, don't override        |
| Assume generic commands (`pnpm build`) | Read `package.json` for actual script names        |
| Hardcode type-check commands           | Use the project's own scripts from `package.json`  |
