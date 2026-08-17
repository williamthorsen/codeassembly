---
name: update-project-guidance
description: Generate or refresh the repo-root AGENTS.md for a repository
user-invocable: true
---

# Update project guidance

Generate or refresh the repository-root `AGENTS.md` — the repo-specific guidance file that gives AI agents the context they need to work effectively in the project. It sits at the root because that is the project slot both harnesses load: Rovo Dev reads it unaided, and Claude Code reaches it through one include.

**Announce at start:** "Using update-project-guidance to author or refresh AGENTS.md."

## Overview

Explore the codebase, classify each finding by scope and tier, and produce a concise `AGENTS.md` that covers everything an agent needs to know about this specific project — and nothing more.

**Two paths.** Where no guidance content exists yet, the **authoring path** drafts a file from the skeleton. Where it does, the **refresh path** reconciles against what is already there: It audits the file's claims against the codebase and emits edits, never a replacement. Discovery is shared, and both paths converge on the same closing steps. Phase 1 selects between them.

**Core principle:** Every line must merit its inclusion. Omit anything an agent would figure out on its own or that is already covered by general guidance.

## Process

### Phase 1: Discover

Gather project information from these sources (skip any that don't exist).

**General baseline:**

- `~/.agents/AGENTS.md` (global, not in the repo) — read first; this defines what's already covered and must not be duplicated

**Existing guidance (current state):**

- `AGENTS.md` (repo root) — read it in full; it is the refresh path's baseline, not background reading

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

#### Resolve the baseline and select the path

The **baseline** is the substantive guidance content that already exists. Choose it by substance, not by existence: Take the repo-root `AGENTS.md` when it carries substantive claims, and otherwise fall back to a legacy `.agents/PROJECT.md`, then `.agents/AGENTS.md`, taking the first that does. A stub at the root — a title and a pointer — does not shadow a mature legacy file, because a pointer is not a claim.

Where both legacy files carry content, `.agents/PROJECT.md` is the baseline as the later convention, and the other is added to the gap-scan sources so its content reaches the change list rather than being archived unread.

Resolve the baseline in memory. A legacy file is not moved here — its content becomes the baseline and reaches the repo root when Phase 3 writes, which is the only point at which this skill is permitted to write anything.

The path follows from what was found. A baseline takes the **refresh path**. No baseline — no guidance file, or nothing but stubs — takes the **authoring path**, where there is nothing to preserve and a bounded gap scan would produce almost nothing.

State which path was selected, and why, before proceeding.

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

- Two axes decide the destination. **Scope** (general vs project-specific) separates `~/.agents/AGENTS.md` from this repo; **tier** (ambient vs reference) then separates what `AGENTS.md` carries from what a package README does. Neither axis is nature (prescriptive vs descriptive): Conventions, commands, and architectural decisions all classify the same way whether they are rules or facts.
- A finding earns the ambient tier only when it is absent from the tool's own output _and_ the obvious action goes wrong without it. A command table restates `--help`; a directory listing restates `ls`. Both are reference at best, and reference material injected at launch rots silently, because nothing fails when it drifts.
- Do not duplicate general guidance. If a project-specific convention _extends_ a general one, include only the delta.
- When unsure about scope, ask the user — one question at a time, prefer multiple choice.
  - When asking option-style questions, follow [option format](#option-format). (Reinforces the rule in `AGENTS.md` — intentional redundancy.)
- Content that is obvious from reading the code (e.g., "this project uses TypeScript") adds no value. Include only what would save an agent from a wrong assumption or a slow discovery.

<!-- include: ../_partials/action-items.md / -->

### Phase 3: Generate

Two constraints govern the repo-root `AGENTS.md`, whichever path produced it:

- **No path into a harness-owned directory**, home-anchored or repository-local. One body of text serves every harness — Rovo Dev reads the file directly, Claude Code through an include — so wiring belonging to one of them is a wrong turn for every other reader. State the fact without the harness path, or record it in that harness's own guidance file.
- **No `<!-- rulebook:` marker.** `sync` strips a rulebook region from this file, so a region introduced by hand disappears on the next run with no warning. The sweep matches complete open/close pairs, which leaves an unpaired marker to linger instead, so the rule covers the marker rather than the region.

#### 3a. Ensure prerequisites

Before generating the main file, check these prerequisites:

**`.agents/preferences.yaml` and `project.slug`:**

1. Read `.agents/preferences.yaml`. If it does not exist, or if it exists but has no `project.slug` value, ask the user to confirm the project slug (suggest one derived from the repo directory name).
2. Create or update `.agents/preferences.yaml` to include the confirmed `project.slug`.

#### 3b. Authoring path: Produce the draft

On the authoring path only. The refresh path skips to 3c.

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

#### 3c. Refresh path: Produce the change list

On the refresh path only. The baseline is the working document: Audit what it claims, find what it is missing, and emit edits against it.

##### Check the constraints

Scan the baseline for a harness-scoped path and for any `<!-- rulebook:` marker. Every hit is a repair, whatever the audit says about it. A harness-scoped path is true for the harness it names and reads as ambient, so neither audit verdict flags it, and anything the change list does not name is carried through untouched.

##### Audit the claims

Two tiers, because a mature file holds more claims than one exhaustive pass can carry. A 35-line file decomposes into dozens of independently checkable assertions, and one at the line budget into several hundred.

- **Tier 1 — every checkable token, exhaustively.** Paths, filenames, command strings, counts, package and symbol names. This is where drift lands: a directory listing that has gained an entry, a count off by two, a tool named one hop from what runs.
- **Tier 2 — narrative claims, in the sections the gap-scan window touched.** Unquantified prose is audited where the repo has moved under it, not everywhere.

Check the claim, not the section. A stale listing looks entirely plausible and is wrong only once the directory is listed, so recognizing a section's shape is the signal to slow down rather than to move on.

Record every audited claim as a ledger row — claim, verdict, evidence:

- `holds` — confirmed. **Requires an evidence token**: the command run, or the `path:line` read.
- `drifted` — no longer true, stating what is true now.
- `unchecked` — not verified, stating why.

A `holds` row without an evidence token is not a permitted state. The audit is otherwise unfalsifiable: A claim that holds produces no edit, so a run that checked nothing emits the same change list as one that checked everything.

Close the ledger by naming what was not audited, so a bounded run reads as bounded.

Re-run the Phase 2 classification only on the sections the window touched, plus one pass against `~/.agents/AGENTS.md` for content the global file has since absorbed. What was ambient last month is still ambient unless something moved.

##### Scan for gaps

Bounded, because an unbounded "what else should this file say?" is a redraft in disguise.

**The window reaches back to whichever is earlier**: the last commit touching `AGENTS.md`, or twenty commits. Twenty is a floor, never a ceiling — a drive-by edit that touched the file two commits ago leaves the window at twenty, not at two. Add `git status --porcelain`, since the common case is an author invoking this mid-session with uncommitted work.

Every `git log` here names its own `--format`. A global or repository `format.pretty` rewrites the output, and a naive parse then reads mangled text with no sign that anything went wrong.

Where git cannot answer — no repository, or the file untracked — state the bound at the gate as "whole repo, additions only" rather than leaving it unstated.

Then one unbounded check against the skeleton: Is an ambient category missing altogether, such as a required bootstrap, a dependency ordering, or a tool that behaves surprisingly? It is the only reach for the fact that was always worth carrying and never captured.

##### Emit the change list

Four kinds of edit, and nothing else:

| Kind         | Use                                             |
| ------------ | ----------------------------------------------- |
| **repair**   | A claim that drifted, or a constraint violation |
| **remove**   | An assertion that lost the ambient tier         |
| **relocate** | A section moved behind a pointer                |
| **add**      | Something the gap scan found                    |

Anything not named is carried through byte-identical.

**A repair quotes verbatim.** It is an old-text/new-text pair whose old text is copied from the baseline. Render `AGENTS.md` content in no other form: no rewritten section, no "here is how that section should read". An edit that cannot quote what it replaces is not a repair, and a rewritten section presented as one large repair is what this rule exists to catch.

Placement:

- An **addition** lands in its matching skeleton section. A new section needs the user's agreement.
- A **removal** or **relocation** names its destination as a recommendation. Writing to a package README touches a separate file and needs its own approval.
- **Relocate when the file exceeds its budget.** Additions can push it past the line budget, and surviving prose may not be reworded to make room, so moving a section behind a pointer is the sanctioned response.

##### Worked example

```
Ledger

| Claim                                      | Verdict   | Evidence                                            |
| ------------------------------------------ | --------- | --------------------------------------------------- |
| `.config/` holds `vitest/` and `eslint/`   | drifted   | `ls .config/` — also holds `readyup.config.ts`      |
| The MCP server exposes five tools          | holds     | `rg -c registerTool packages/mcp/src/server.ts` → 5 |
| `pnpm run bootstrap` builds every package  | holds     | `package.json:14`                                   |
| The compile cache is keyed on inputs alone | unchecked | upstream behavior, not verifiable from this repo    |

Not audited: the Code style section, which the window did not touch.

Change list

1. repair — the `.config/` listing
   old: Configuration lives in `.config/vitest/` and `.config/eslint/`.
   new: Configuration lives in `.config/`, holding `vitest/`, `eslint/`, and `readyup.config.ts`.
2. relocate — Commands moves to `packages/agents/README.md` behind a pointer; the addition below puts the file two lines over budget.
3. add — Gotchas: `rdy compile` regenerates `kits/default.js`, so an edit to the `.js` is lost on the next build.
```

<HARD-GATE>
Do NOT write any files until the user has reviewed and approved both the ledger and the change list. This applies regardless of perceived simplicity.
</HARD-GATE>

#### 3d. Write files

After the user approves:

1. Write `AGENTS.md` at the repository root. Rovo Dev loads it from there with no further wiring. On the refresh path the content is the baseline with the approved edits applied: Apply them rather than re-rendering the file, so everything the change list does not name survives unaltered. A baseline that came from a legacy path lands here too.
2. Ensure `.claude/CLAUDE.md` reaches it through a raw include. Claude Code resolves a relative include against the directory holding the file that carries it, not against the repository root, so an include written in `.claude/CLAUDE.md` must climb out of `.claude/` to reach the root: `@../AGENTS.md`. Derive the include from where the importing file sits rather than copying a literal, and confirm the path it resolves to is the guidance file you just wrote.
   - If `.claude/CLAUDE.md` does not exist, create it with that include as its content.
   - If it exists and carries a prose instruction referencing the guidance file (e.g., `Read @../AGENTS.md, which provides...`), replace it with the raw include.
   - If it exists with an include that resolves anywhere else — a stale `@.agents/PROJECT.md`, or any path that does not climb out of `.claude/` — repoint it.
   - If it exists with other content that reaches no guidance file, add the include on its own line.
   - If it exists with content that has special instructions beyond a simple include, present a recommendation to the user and wait for their decision before modifying.

#### 3e. Handle legacy files

If legacy guidance files were found in Phase 1 (`.agents/PROJECT.md` or `.agents/AGENTS.md`):

1. Confirm with the user that the project-specific content has been migrated to the repo-root `AGENTS.md`.
2. Carry across any include the legacy file resolved for itself. A `.agents/PROJECT.md` that included a sibling by a bare relative path reaches a different file from the repository root, so every such include needs its own path re-derived against the new location.
3. Recommend removing or archiving the legacy files. Do not delete without explicit approval.

#### 3f. Handle general-guidance recommendations

If any findings were classified as **general** (cross-repo) in Phase 2:

1. Present them as a bulleted list after the main file is written.
2. Ask the user whether to integrate them into `~/.agents/AGENTS.md`.
3. If approved, read `~/.agents/AGENTS.md`, identify the appropriate existing section for each recommendation, and integrate the new content in the right place — do not blindly append. If no suitable section exists, propose a new section name before adding it.

#### 3g. Run the guidance checklist

Close by running the published `guidance` checklist against the result: `rdy run --packages`, from the repository root.

Skip the step where `rdy` is unavailable, or where no configured package publishes the checklist. It ships as a development dependency of the package that publishes it, not something a consuming repository inherits. Report the step as skipped; never report a pass it did not produce.

The freshness check reads committed history, so the write just made does not move it. On the stale file that motivated a refresh it still reports stale, and its remediation text advises running this very skill. That is expected, and it clears when the change is committed: Do not act on that advice, and do not commit in order to clear it.

## Quality checklist

Before presenting the draft or the change list, verify:

- [ ] No path reaches into a harness-owned directory, home-anchored or repository-local
- [ ] No `<!-- rulebook:` marker appears anywhere in the file
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
