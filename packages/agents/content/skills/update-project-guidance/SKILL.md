---
name: update-project-guidance
description: Generate or refresh .agents/PROJECT.md for a repository
user-invocable: true
---

# Update project guidance

Generate or refresh `.agents/PROJECT.md` — the repo-specific guidance file that gives AI agents the context they need to work effectively in the project.

**Announce at start:** "Using update-project-guidance to generate .agents/PROJECT.md."

## Overview

Explore the codebase, classify findings by scope, and produce a concise `.agents/PROJECT.md` that covers everything an agent needs to know about this specific project — and nothing more.

**Core principle:** Every line must merit its inclusion. Omit anything an agent would figure out on its own or that is already covered by general guidance.

## Process

### Phase 1: Discover

Gather project information from these sources (skip any that don't exist).

**General baseline:**

- `~/.agents/AGENTS.md` (global, not in the repo) — read first; this defines what's already covered and must not be duplicated

**Existing guidance (current state):**

- `.agents/PROJECT.md` — if it exists, this is an update; note what's already there

**Legacy guidance files (migrate or flag):**

- `AGENTS.md` (repo root) — conventional for non-Claude agents; may contain project-specific content to migrate
- `.agents/AGENTS.md` (repo, not the global `~/.agents/AGENTS.md`) — earlier convention before the PROJECT.md split; content should migrate to `.agents/PROJECT.md`

**Project metadata:**

- `package.json` (root) — name, workspaces, scripts, engines, type
- `package.json` (each workspace package) — name, description, key dependencies
- `pnpm-workspace.yaml` / `lerna.json` / similar — monorepo structure

**Configuration:**

- `tsconfig.json` — compiler strictness, module system, paths, target
- Build configs — Vite, esbuild, webpack, Rollup, etc.
- Test configs — Vitest, Jest, Playwright, etc.
- `.editorconfig`, `.prettierrc*`, `eslint.config*` — formatting and quality rules
- CI configs — `.github/workflows/`, `.gitlab-ci.yml`, etc.

**Documentation:**

- `README.md` — project description, setup instructions
- `docs/` — architecture docs, conventions, guides

**Discovery should be pragmatic, not exhaustive.** Read root metadata, workspace config, and package-level `package.json` files for names and descriptions. Don't deep-dive into every package's internals. For monorepos, a concise description of each package (name, purpose, key technology) is enough — package-specific details belong at the package level.

Collect findings as a flat list before moving to classification.

### Phase 2: Analyze and classify

For each finding, assign one of these scopes:

| Scope                | Destination                         | Test                                                 |
| -------------------- | ----------------------------------- | ---------------------------------------------------- |
| **Project-specific** | `.agents/PROJECT.md`                | Applies only to this repo                            |
| **Already covered**  | Omit                                | Already stated in `~/.agents/AGENTS.md`              |
| **General**          | Recommend for `~/.agents/AGENTS.md` | Applies across repos but not yet in general guidance |
| **Ambiguous**        | Ask the user                        | Could go either way — ask one question at a time     |

**Rules:**

- The distinction is **scope** (general vs project-specific), not nature (prescriptive vs descriptive). Project-specific conventions, commands, and architectural decisions all belong in PROJECT.md regardless of whether they are rules or facts.
- Do not duplicate general guidance. If a project-specific convention _extends_ a general one, include only the delta.
- When unsure about scope, ask the user — one question at a time, prefer multiple choice.
  - When asking option-style questions, follow [option format](#option-format). (Reinforces the rule in `AGENTS.md` — intentional redundancy.)
- Content that is obvious from reading the code (e.g., "this project uses TypeScript") adds no value. Include only what would save an agent from a wrong assumption or a slow discovery.

### Phase 3: Generate

#### 3a. Ensure prerequisites

Before generating the main file, check these prerequisites:

**`.agents/preferences.yaml` and `project.slug`:**

1. Read `.agents/preferences.yaml`. If it does not exist, or if it exists but has no `project.slug` value, ask the user to confirm the project slug (suggest one derived from the repo directory name).
2. Create or update `.agents/preferences.yaml` to include the confirmed `project.slug`.

#### 3b. Produce PROJECT.md

Generate `.agents/PROJECT.md` using the standard structure below. Include only sections that carry content.

```markdown
# {Project title}

## Overview

{What the project is, what problem it solves, key technology. 2-4 sentences.}

## Project structure

{Monorepo layout, package descriptions with their purpose, key files worth knowing about. Use a compact format — not a full directory tree.}

## Commands

{Development, testing, build, and quality commands. Group by scope (root-level, package-level, package-specific). Omit commands that are obvious from package.json.}

## Architecture

{Build system, key patterns, data flow between components, dependency ordering. Focus on things that affect how an agent should approach changes.}

## Code style

{Repo-specific conventions not covered by general guidance. Omit if everything is already general.}

## Gotchas

{Non-obvious things that trip up agents: Build-order dependencies, tools with surprising behavior, naming inconsistencies, common mistakes.}
```

<HARD-GATE>
Do NOT write any files until the user has reviewed and approved the draft. Present the draft PROJECT.md content and wait for explicit approval. This applies regardless of perceived simplicity.
</HARD-GATE>

#### 3c. Write files

After the user approves the draft:

1. Write `.agents/PROJECT.md` (create the `.agents/` directory if needed).
2. Ensure `.claude/CLAUDE.md` contains a raw `@.agents/PROJECT.md` include:
   - If `.claude/CLAUDE.md` does not exist, create it with `@.agents/PROJECT.md` as its content.
   - If it exists and contains a prose instruction referencing `.agents/PROJECT.md` (e.g., `Read @.agents/PROJECT.md, which provides...`), replace it with the raw include `@.agents/PROJECT.md`.
   - If it exists with other content that doesn't reference PROJECT.md, add `@.agents/PROJECT.md` on its own line.
   - If it exists with content that has special instructions beyond a simple include, present a recommendation to the user and wait for their decision before modifying.

#### 3d. Handle legacy files

If legacy guidance files were found in Phase 1 (`AGENTS.md` at repo root or `.agents/AGENTS.md` in the repo):

1. Confirm with the user that the project-specific content has been migrated to the new `.agents/PROJECT.md`.
2. Recommend removing or archiving the legacy files. Do not delete without explicit approval.

#### 3e. Handle general-guidance recommendations

If any findings were classified as **general** (cross-repo) in Phase 2:

1. Present them as a bulleted list after the main file is written.
2. Ask the user whether to integrate them into `~/.agents/AGENTS.md`.
3. If approved, read `~/.agents/AGENTS.md`, identify the appropriate existing section for each recommendation, and integrate the new content in the right place — do not blindly append. If no suitable section exists, propose a new section name before adding it.

## Quality checklist

Before presenting the draft, verify:

- [ ] No line duplicates content from `~/.agents/AGENTS.md`
- [ ] No section merely restates what's obvious from the code
- [ ] Commands listed are ones an agent would actually need (not exhaustive npm script listings)
- [ ] Each command group states where to run it (repo root, package directory, etc.) — don't assume the agent knows
- [ ] Architecture section focuses on decisions that affect how to make changes, not documentation for its own sake
- [ ] Gotchas are genuinely non-obvious — not things an agent would discover from a type error or linter warning

## Key principles

- **Conciseness over completeness** — a shorter file that covers the essentials is better than a comprehensive one that wastes context window
- **Scope-aware** — read general guidance first, never duplicate it
- **Interactive** — ask when classification is unclear, but don't overwhelm with questions
- **Portable** — this skill works in any repo that follows the `.agents/PROJECT.md` convention
- **Honest about uncertainty** — if something might belong in general guidance, say so rather than silently including it

<!-- include: ../_partials/option-format.md / -->
