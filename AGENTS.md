# CodeAssembly monorepo

@.agents/nmr/AGENTS.md

## Project structure

This is a pnpm monorepo centered around agentic code-orchestration flows. It contains eight packages:

- **Run-core** (`packages/run-core/`) — canonical domain model, Zod schemas, and data parsing for orchestration runs; foundational library consumed by other packages
- **MCP** (`packages/mcp/`) — MCP server exposing run-management tools (`init_run`, `emit_event`, `register_artifact`, `complete_run`, `get_run_state`) built on run-core
- **Agents** (`packages/agents/`) — CLI tool and content library of reusable AI agent skills and subagent definitions that power orchestrated development workflows
- **Factory** (`packages/factory/`) — web-based visualization that renders orchestration runs as an interactive 2D game scene
- **KB** (`packages/kb/`) — knowledge-base foundation library: discovery, registry loading, frontmatter parsing, tags, and type-blind vault-integrity checks
- **Lifecycle** (`packages/lifecycle/`) — canonical session-lifecycle event envelope, vocabulary, and pure lane fold; consumed by instrumented skills and by Fleet
- **Fleet** (`packages/fleet/`) — server of the fleet-visibility stack: watches the lifecycle-events root, folds lane state via lifecycle, and serves a typed lanes snapshot plus an SSE stream (see `packages/fleet/README.md`)
- **Foreman** (`packages/foreman/`) — client app of the fleet-visibility stack: the Mantine lane view over Fleet's snapshot and SSE stream, served by Vite with `/api` proxied to Fleet (see `packages/foreman/README.md`)

The packages form a dependency chain: **run-core** ← **mcp**, **run-core** ← **factory**, **lifecycle** ← **fleet**, and **fleet** ← **foreman**. Agents depends on **kb**, which it bundles into the KB skills it ships (it also produces the artifact files that run-core parses). Co-locating the packages ensures schema changes can be made atomically.

### Run-core (`packages/run-core/`)

Shared runtime library. Exports via three subpath entries:

- `.` — types (`CanonicalRunStatus`, `RunStatus`, `Phases`, event types), constants (`PHASE_NAMES`, `PHASE_ROLE`), schemas, `foldEvents()` (reconstructs run state from header + event log)
- `./config` — path resolution (`resolveBaseDir()`, `resolveProjectsDir()`)
- `./parsers` — Node.js file parsers for run data
- `./scanners` — directory scanning and validation

**Package:** `codeassembly-run-core` (private)

### MCP (`packages/mcp/`)

MCP server for orchestrated run management. Wraps run-core capabilities as five MCP tools for Claude integration.

**Package:** `codeassembly-mcp` (private)

**Bin:** `codeassembly-mcp` — the stdio server entry point. `.claude/settings.json` launches the server through `packages/mcp/bin/codeassembly-mcp.js`.

### Agents (`packages/agents/`)

The agents package is a CLI tool (`codeassembly`) that installs reusable AI skills and subagent definitions into harness-specific directories. It also serves as the canonical home for all skill and subagent content.

**Package:** `codeassembly` (private)

**CLI commands:**

| Command             | Description                                                                                     |
| ------------------- | ----------------------------------------------------------------------------------------------- |
| `configure-hooks`   | Writes the session-lifecycle hook entries into harness configs (also run by `install`)          |
| `generate <target>` | Scaffolds project files (`label-map`)                                                           |
| `init`              | Scaffolds `.agents/codeassembly.yaml` (or `~/.agents/codeassembly.yaml` with `--global`)        |
| `install`           | Copies or symlinks skills and subagents into harness directories; prunes deleted-source files   |
| `library list`      | Lists available library artifacts (rulebooks, skills, subagents)                                |
| `status`            | Shows current vs modified vs missing installed items                                            |
| `sync`              | Resolves `.agents/codeassembly.yaml` and materializes declared rulebooks, skills, and subagents |
| `uninstall`         | Removes previously installed items (respects drift detection)                                   |
| `validate`          | Checks a content root for defects that would fail at a consumer; requires no declaration        |

Key flags: `--harness <claude|rovodev|all>`, `--link` (symlink instead of copy), `--force` (overwrite modified), `--dry-run`, `--content <dir>` (`validate` only).

**Supported harnesses:**

- **Claude Code** (`claude`) — installs into `~/.claude/skills/` and `~/.claude/agents/`
- **Rovo Dev** (`rovodev`) — installs into `~/.rovodev/skills/` and `~/.rovodev/subagents/`

**Source layout:**

```
packages/agents/
  src/
    cli.ts                         # CLI entry point (Commander-based)
    lib/
      types.ts                     # Core interfaces: HarnessId, ManifestEntry, InstallOptions
      harness.ts                   # Harness config table, detection, path resolution
      manifest.ts                  # ~/.codeassembly/agents-manifest.json; SHA-256 hashing; drift detection
      installer.ts                 # copyItem(), linkItem(), removeItem(), checkSymlinkSafety()
      content-resolver.ts          # Resolves content/ dir in dev vs built layouts
      frontmatter-merger.ts        # Parses YAML frontmatter; merges harness overrides from _data/*.yaml
      __tests__/                   # Unit tests for library modules
  content/                         # Skill and subagent definitions (see below)
  scripts/
    copy-content.ts                # Post-compile: copies content/ to dist/, adds shebang to CLI
```

**Content directory:**

```
content/
  skills/
    _data/                         # Shared reference data (not skills themselves)
      artifact-conventions.md      # run-index.json schema, artifact naming conventions
      branch-format.md             # Branch naming specification
      case-conventions.md          # Naming conventions
      commit-format.md             # Commit title format specification
      git-commands.md              # Git command reference
      work-types.json              # Commit work-type taxonomy (JSON SSOT; companion schema at schemas/work-types.schema.json)
    _partials/                     # Reusable Markdown fragments inlined at install time
    {skill-name}/SKILL.md          # Each skill is a directory with a single SKILL.md file
    orchestrate/                   # Multi-file skill with sub-modules
      SKILL.md
      modules/
        review-cycle.md
  subagents/
    _data/
      claude.yaml                  # Harness frontmatter overrides for Claude Code
      rovodev.yaml                 # Harness frontmatter overrides for Rovo Dev
    {agent-name}.md                # Each subagent is a single .md file
```

**Skill frontmatter:** `name`, `description`, `user-invocable` (true = directly invocable, false = internal/referenced by other skills), `harnesses` (a harness id or list restricting deployment to those harnesses; absent deploys to all).

**Subagent frontmatter:** `name`, `description`, `tools` (allowed tools), `maxTurns`, `skills` (injected skill references).

**Harness overlay mechanism:** `claude.yaml` and `rovodev.yaml` contain per-agent frontmatter overrides (plus `_defaults`). During install, the CLI merges matching keys into each subagent's frontmatter using key-level replacement.

**Harness-scoped skills:** A skill narrows itself through its `harnesses:` frontmatter field; one declaring none deploys to every harness. Directories prefixed with `_` under `skills/` (`_data`, `_partials`) hold shared reference data and inlined fragments rather than skills, and deploy nothing invocable. For Rovo Dev, `sync` also generates `~/.rovodev/prompts.yml` as a skill discovery file, listing all user-invocable skills (skills with `user-invocable: false` are excluded).

#### Content authoring

When authoring a skill, subagent, rulebook, or collection, consult `packages/agents/content/guidance/rulebooks/codeassembly-content-specification.md` (the `consult-codeassembly-content-specification` skill) for `dependencies:`/`members:`, frontmatter, and naming conventions.

The `packages/agents/content/` tree supports **partials** — reusable Markdown fragments inlined at install time. The expander produces byte-identical installed output, so partials are the correct DRY mechanism even when "verbatim execution context" is a requirement. See `packages/agents/content/_partials/README.md` for the canonical reference.

> Content that appears identically in 2+ skill/subagent files should be a partial whenever parallel copies would drift if maintained separately. Treat partials as the prose analogue of subroutines.

#### The orchestration system

The skills implement a multi-phase agentic development pipeline. Entry points:

- **`/orchestrate-dev`** — full workflow (default), lightweight (`--mode=vibe`), or thorough (`--mode=strict`)
- **`/orchestrate-review`** — review-only workflow for manually written code

The `orchestrate` skill is the internal pipeline engine. It:

1. Generates a run ID, writes `run-manifest.md` and `run-index.json`
2. Dispatches subagents via the Task tool for each phase
3. Runs a review cycle (parallel aspect reviewers + code-simplifier + holistic review)
4. Writes `run-summary.md` and finalizes `run-index.json`

**Subagent roles:**

| Subagent                         | Phase             | Purpose                                                                         |
| -------------------------------- | ----------------- | ------------------------------------------------------------------------------- |
| `orchestrated-architect`         | Architecture      | Assesses architectural impact; classifies as none/low/medium/high               |
| `orchestrated-planner`           | Planning          | Creates ordered implementation plans (.md + .json)                              |
| `orchestrated-coder`             | Implementation    | Implements code, runs quality gates, commits, writes change-summary.md          |
| `orchestrated-reviewer`          | Review + Holistic | Structured code review with F/W/T/R/S finding scheme (+ `-L` suffix for legacy) |
| `aspect-code-reviewer`           | Review (parallel) | Focused on CLAUDE.md compliance, bugs, logic errors                             |
| `aspect-silent-failure-reviewer` | Review (parallel) | Focused on error-handling and silent failures                                   |
| `aspect-test-reviewer`           | Review (parallel) | Focused on test coverage quality and behavioral gaps                            |
| `planner`                        | Standalone        | Breaks stories into independently orchestrable steps                            |

**Artifact storage:** `{base_dir}/projects/{project-slug}/tickets/{ticket-id}/{run-id}/`

**Flow control:** Each subagent returns a structured block with `Criticality`, `Impact`, `Steps`, and `Status` that the orchestrator parses.

### Factory (`packages/factory/`)

Factory is a web-based visualization that represents agentic orchestration runs as an interactive game scene with lo-fi arcade characters. Agents appear at stations corresponding to workflow phases, animate based on run status, and move between stations as the run progresses.

**Tech stack:** Excalibur v0.32 (2D game engine), React 19, Express 5, TypeScript, Vite

**Source layout:**

```
packages/factory/src/
  client/                    # React + Excalibur frontend
    components/              # React UI: GameCanvas, RunSelector, StatusBar
    game/
      actors/                # Excalibur actors: AgentActor, StationActor, GateActor, ArtifactActor
      layout/                # Platform/station positioning, walk paths
      mappers/               # run-to-scene: converts CanonicalRunStatus -> SceneConfig
      scenes/                # FactoryScene: orchestrates actors, diffing, camera
      sprites/               # Sprite sheet generation, caching, animation definitions
      state/                 # agent-differ (structural diff), agent-state-resolver (animation state)
    hooks/                   # useRunStatus, useSelectionParams
    api/                     # API client
  server/                    # Express API server
    routes/                  # /projects, /runs endpoints
    services/                # project-scanner (discovers run data on disk)
    adapters/                # status-adapter: parses run-index.json/status.json -> CanonicalRunStatus
  shared/                    # Code shared between client and server
    types/                   # canonical.ts (domain model), api.ts (API contracts)
    constants/               # palette.ts (CGA-16 colors), role-types.ts (phases, roles, role colors)
```

**Key architectural patterns:**

- **Data flow:** Express reads `run-index.json` (v2) or `status.json` (v1) from disk -> `status-adapter` normalizes to `CanonicalRunStatus` -> client `run-to-scene` mapper produces `SceneConfig` (stations, gates, agents, artifacts) -> `FactoryScene` diffs agents and updates Excalibur actors
- **Agent diffing:** `agent-differ.ts` computes added/removed/moved/unchanged agents by `role` key. Removed agents fade out; added agents appear; moved agents walk to new positions via Excalibur actions
- **Animation states:** `AgentAnimationState` = `idle | working | walking | celebrating | concerned`. Resolved from run/phase status by `agent-state-resolver.ts`. Walking state defers other state changes via `pendingState`
- **Sprite system:** SVG-based placeholder sprites generated per role type, converted to Excalibur `SpriteSheet` with `ImageFiltering.Pixel`. Animations cached per role type in module-level maps. 3x3 grid layout (32px cells): row 0 = idle/walking, row 1 = working, row 2 = celebrating/concerned
- **Decoupled rendering:** Excalibur owns the game canvas and all visual state. React owns UI chrome (selector, status bar). They do not share state directly

**Domain model:**

- **Phases** (in order): `architecture`, `planning`, `implementation`, `review`, `simplifier`, `holistic`, `summary`
- **Role types:** `orchestrator`, `analyst`, `planner`, `author`, `reviewer` — each phase maps to a role type
- **Color palette:** CGA-16 colors in `palette.ts`, role-type colors derived from it
- **Run statuses:** `in_progress`, `completed`, `failed`, `needs_manual_review`

**Connection to agents:** Factory's `status-adapter.ts` parses the `run-index.json` files that the orchestration engine writes. The schema is defined in `content/skills/_data/artifact-conventions.md` (agents) and represented as TypeScript types in `shared/types/canonical.ts` (factory). When the schema changes, both must be updated together.

### KB (`packages/kb/`)

Foundation library for knowledge-base tooling, consumed by the `kb-retrieve` and `kb-add` skills, the planned `kb-curate` skill, and the planned `@williamthorsen/kb-mcp` server. Exposes subpath entries covering KB discovery and `kb.yaml` registry loading, note frontmatter parsing and writing, per-type record parsing, tag canonicalization, and type-blind vault-integrity checks.

**Package:** `@williamthorsen/kb` (private)

The package README documents the `kb.yaml` configuration schema and merge semantics and the error model — consult it before declaring a KB or consuming the library.

## Common commands

**Root-level development (via `@williamthorsen/nmr`):**

- `pnpm install` - Install all dependencies
- `pnpm run bootstrap` - Build every package, then deploy current guidance into the worktree's harness dirs; required after install before the MCP server or CLI bins will run
- `pnpm run agents:sync` - Deploy current guidance on its own (the second half of bootstrap)
- `nmr check` - Run typecheck, format check, lint check, and tests
- `nmr check:strict` - Strict checks including coverage and audit
- `nmr ci` - Full CI pipeline (strict checks + build)
- `nmr build` - Build all packages
- `nmr test` - Run tests across all packages
- `nmr lint` - Fix lint in all packages
- `nmr lint:check` - Check for lint in all packages
- `nmr typecheck` - TypeScript check all packages
- `nmr root:test` - Run only root-level tests (those outside `packages/`)
- `nmr root:lint` - Lint only root-level files

**Workspace packages (via nmr):**

- `nmr build` - Build the package
- `nmr test` - Run tests
- `nmr test:watch` - Run tests in watch mode
- `nmr test:coverage` - Run tests with coverage
- `nmr test:tool` - Run only the `tool` tier (`*.tool.test.ts`), the tests that reach a program the environment supplies
- `nmr test:unit` - Run only the `unit` tier
- `nmr test:all` - Run every tier, including the two that carry no default script
- `nmr lint` - Fix lint
- `nmr lint:check` - Check for lint
- `nmr typecheck` - TypeScript check

**Factory package (`packages/factory/`):**

- `pnpm run dev` - Start both Express server and Vite dev server
- `pnpm run dev:server` - Start Express server only (with tsx --watch)
- `pnpm run dev:client` - Start Vite dev server only

**Foreman package (`packages/foreman/`):**

- `pnpm run dev` - Start the Vite dev server on port 4179 (proxies `/api` to Fleet)

**Agents package (`packages/agents/`):**

- `pnpm run build` - Compile TypeScript + copy content to dist

## Architecture

### Root-level tests

- Located in `scripts/__tests__/` and `.readyup/lib/__tests__/`
- Use Vitest with config in `vitest.root.config.ts`, which excludes `packages/**`

### Workspace script system

- Centralized script management via `@williamthorsen/nmr`
- Run workspace scripts with `nmr {command}` (e.g., `nmr test`, `nmr build`)
- Default scripts (build, test, lint, typecheck, etc.) provided by nmr
- Package-specific overrides in each package's `package.json`

### Build system

- Uses `nmr-compile` (from `@williamthorsen/nmr`) for TypeScript packages, emitting `.js` and `.d.ts` in a single TypeScript pass
- Intelligent caching based on content hashes, keyed under `node_modules/.cache/nmr-compile/`
- Automatic `.ts` to `.js` extension rewriting, in compiled output and emitted declarations alike
- Alias resolution support for `~/`-prefixed imports
- Factory uses Vite with `@vitejs/plugin-react` for the web app

Deleting `dist/` does not force a rebuild. The build cache lives outside it and is keyed on inputs alone, so a rebuild after a manual delete skips and leaves `dist/` empty. Clear `node_modules/.cache/nmr-compile/` too. Tracked upstream at williamthorsen/node-monorepo-tools#470.

### TypeScript

- Strict mode across all packages (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitReturns`)
- `moduleResolution: NodeNext`, `target: ES2025`
- Type checking via `tsgo` (`@typescript/native-preview`) for speed

### Testing

- Vitest across all packages, built on `@williamthorsen/nmr/vitest` and its projects model
- Every config layers in `.config/vitest/shared-options.ts`, which adds the two settings nmr does not provide: the `source` resolve conditions that let workspace packages resolve from `.ts` source without a prior build, and the setup file keeping test git subprocesses out of the developer's global git config. A config that omits the layer loses both silently, so the guard beside that module fails when any config, root or package, bypasses it
- Each workspace package carries a `vitest.config.ts`, even where it adds nothing, because that layer is what it exists to apply
- Package-specific options go through the `project` seam, not `root`; Vitest ignores collection options at the root once `projects` exists. To reach a single tier, use the `tiers` seam
- A suite that installs or deploys the whole content catalog declares its own `{ timeout }`
- Coverage reporting with v8 provider

### Code quality

- ESLint with `@williamthorsen/eslint-config-typescript`
- Prettier via `@williamthorsen/nmr/prettier`, which also formats shell scripts and Dockerfiles; `nmr fmt` covers them, so the repo runs no separate `shfmt` step
- TypeScript strict mode
- Optional strict linting with `@williamthorsen/strict-lint`

### Code organization

- Write modular, composable code, even when there is only a single consumer.
- Nest directories intelligently to provide useful groupings. Do not start with a flat directory structure and then entrench it as convention.

## Dependency management

- Use exact versions in package.json (no `^` or `~` range indicators)

## Reference documents

- `docs/pixel-agents-analysis.md` - Architectural analysis of [pablodelucca/pixel-agents](https://github.com/pablodelucca/pixel-agents), a related project that visualizes agents as pixel-art characters. Contains findings on animation techniques, sprite systems, state management, and streaming patterns relevant to Factory's development.
