---
name: update-project-guidance
description: Generate or refresh the repo-root AGENTS.md for a repository
user-invocable: true
---

# Update project guidance

Generate or refresh the repository-root `AGENTS.md` — the repo-specific guidance file that gives AI agents the context they need to work effectively in the project. It sits at the root because that is the project slot both harnesses load: Rovo Dev reads it unaided, and Claude Code reaches it through one include.

**Announce at start:** "Using update-project-guidance to generate AGENTS.md."

## Overview

Explore the codebase, classify each finding by scope and tier, and produce a concise `AGENTS.md` that covers everything an agent needs to know about this specific project — and nothing more.

**Core principle:** Every line must merit its inclusion. Omit anything an agent would figure out on its own or that is already covered by general guidance.

## Process

### Phase 1: Discover

Gather project information from these sources (skip any that don't exist).

**General baseline:**

- `~/.agents/AGENTS.md` (global, not in the repo) — read first; this defines what's already covered and must not be duplicated

**Existing guidance (current state):**

- `AGENTS.md` (repo root) — if it exists, this is an update; note what's already there

**Legacy guidance files (migrate or flag):**

- `.agents/PROJECT.md` — the previous location for this file; content should migrate to the repo-root `AGENTS.md`
- `.agents/AGENTS.md` (repo, not the global `~/.agents/AGENTS.md`) — an earlier convention still; content should migrate the same way

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

For each finding, assign one of these classes:

| Class               | Destination                             | Test                                                                    |
| ------------------- | --------------------------------------- | ----------------------------------------------------------------------- |
| **Ambient**         | `AGENTS.md`                             | Applies only to this repo, and the obvious action goes wrong without it |
| **Reference**       | The owning package's README, or `docs/` | Applies only to this repo, but an agent needs it occasionally           |
| **Already covered** | Omit                                    | Already stated in `~/.agents/AGENTS.md`, or printed by the tool itself  |
| **General**         | Recommend for `~/.agents/AGENTS.md`     | Applies across repos but not yet in general guidance                    |
| **Ambiguous**       | Ask the user                            | Could go either way — ask one question at a time                        |

**Rules:**

- Two axes decide the destination. **Scope** (general vs project-specific) separates `~/.agents/AGENTS.md` from this repo; **tier** (ambient vs reference) then separates what `AGENTS.md` carries from what a package README does. Neither axis is nature (prescriptive vs descriptive): conventions, commands, and architectural decisions all classify the same way whether they are rules or facts.
- A finding earns the ambient tier only when it is absent from the tool's own output _and_ the obvious action goes wrong without it. A command table restates `--help`; a directory listing restates `ls`. Both are reference at best, and reference material injected at launch rots silently, because nothing fails when it drifts.
- Do not duplicate general guidance. If a project-specific convention _extends_ a general one, include only the delta.
- When unsure about scope, ask the user — one question at a time, prefer multiple choice.
  - When asking option-style questions, follow [option format](#option-format). (Reinforces the rule in `AGENTS.md` — intentional redundancy.)
- Content that is obvious from reading the code (e.g., "this project uses TypeScript") adds no value. Include only what would save an agent from a wrong assumption or a slow discovery.

<!-- include: ../_partials/action-items.md / -->

### Phase 3: Generate

#### 3a. Ensure prerequisites

Before generating the main file, check these prerequisites:

**`.agents/preferences.yaml` and `project.slug`:**

1. Read `.agents/preferences.yaml`. If it does not exist, or if it exists but has no `project.slug` value, ask the user to confirm the project slug (suggest one derived from the repo directory name).
2. Create or update `.agents/preferences.yaml` to include the confirmed `project.slug`.

#### 3b. Produce AGENTS.md

Generate `AGENTS.md` using the standard structure below. Include only sections that carry content.

```markdown
# {Project title}

## Overview

{What the project is, what problem it solves, key technology. 2-4 sentences.}

## Project structure

{One clause per package: what it owns, plus a pointer to its own README. Never a directory tree — `ls` prints that, and a transcribed one rots.}

## Commands

{Only commands whose absence sends an agent wrong: a required bootstrap, a non-obvious entry point. Omit anything the tool lists from `--help` or a bare invocation.}

## Architecture

{Only what changes how an agent approaches a change: dependency ordering, and couplings that nothing enforces. Not a recital of the TypeScript, test, or lint configuration.}

## Code style

{Repo-specific conventions not covered by general guidance. Omit if everything is already general.}

## Gotchas

{Non-obvious things that trip up agents: Build-order dependencies, tools with surprising behavior, naming inconsistencies, common mistakes.}
```

<HARD-GATE>
Do NOT write any files until the user has reviewed and approved the draft. Present the draft AGENTS.md content and wait for explicit approval. This applies regardless of perceived simplicity.
</HARD-GATE>

#### 3c. Write files

After the user approves the draft:

1. Write `AGENTS.md` at the repository root. Rovo Dev loads it from there with no further wiring.
2. Ensure `.claude/CLAUDE.md` reaches it through a raw include. Claude Code resolves a relative include against the directory holding the file that carries it, not against the repository root, so an include written in `.claude/CLAUDE.md` must climb out of `.claude/` to reach the root: `@../AGENTS.md`. Derive the include from where the importing file sits rather than copying a literal, and confirm the path it resolves to is the guidance file you just wrote.
   - If `.claude/CLAUDE.md` does not exist, create it with that include as its content.
   - If it exists and carries a prose instruction referencing the guidance file (e.g., `Read @../AGENTS.md, which provides...`), replace it with the raw include.
   - If it exists with an include that resolves anywhere else — a stale `@.agents/PROJECT.md`, or any path that does not climb out of `.claude/` — repoint it.
   - If it exists with other content that reaches no guidance file, add the include on its own line.
   - If it exists with content that has special instructions beyond a simple include, present a recommendation to the user and wait for their decision before modifying.

#### 3d. Handle legacy files

If legacy guidance files were found in Phase 1 (`.agents/PROJECT.md` or `.agents/AGENTS.md`):

1. Confirm with the user that the project-specific content has been migrated to the repo-root `AGENTS.md`.
2. Carry across any include the legacy file resolved for itself. A `.agents/PROJECT.md` that included a sibling by a bare relative path reaches a different file from the repository root, so every such include needs its own path re-derived against the new location.
3. Recommend removing or archiving the legacy files. Do not delete without explicit approval.

#### 3e. Handle general-guidance recommendations

If any findings were classified as **general** (cross-repo) in Phase 2:

1. Present them as a bulleted list after the main file is written.
2. Ask the user whether to integrate them into `~/.agents/AGENTS.md`.
3. If approved, read `~/.agents/AGENTS.md`, identify the appropriate existing section for each recommendation, and integrate the new content in the right place — do not blindly append. If no suitable section exists, propose a new section name before adding it.

## Quality checklist

Before presenting the draft, verify:

- [ ] The file is at most 200 lines, matching the ambient budget the published guidance checklist reports against; anything that pushed it over went to the package level behind a pointer
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
- **Portable** — this skill works in any repo that follows the repo-root `AGENTS.md` convention
- **Honest about uncertainty** — if something might belong in general guidance, say so rather than silently including it

<!-- include: ../_partials/option-format.md / -->
