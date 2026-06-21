# CodeAssembly monorepo

@nmr/AGENTS.md

## Project structure

This is a pnpm monorepo centered around agentic code-orchestration flows. It contains five packages:

- **Run-core** (`packages/run-core/`) — canonical domain model, Zod schemas, and data parsing for orchestration runs; foundational library consumed by other packages
- **MCP** (`packages/mcp/`) — MCP server exposing run-management tools (`init_run`, `emit_event`, `register_artifact`, `complete_run`, `get_run_state`) built on run-core
- **Agents** (`packages/agents/`) — CLI tool and content library of reusable AI agent skills and subagent definitions that power orchestrated development workflows
- **Factory** (`packages/factory/`) — web-based visualization that renders orchestration runs as an interactive 2D game scene
- **KB** (`packages/kb/`) — knowledge-base foundation library: discovery, registry loading, schema resolution, frontmatter parsing, tags, and validation rules

The packages form a dependency chain: **run-core** ← **mcp** and **run-core** ← **factory**. Agents depends on **kb**, which it bundles into the KB skills it ships (it also produces the artifact files that run-core parses). Co-locating the packages ensures schema changes can be made atomically.

### Run-core (`packages/run-core/`)

Shared runtime library. Exports via three subpath entries:

- `.` — types (`CanonicalRunStatus`, `RunStatus`, `Phases`, event types), constants (`PHASE_NAMES`, `PHASE_ROLE`), schemas, `foldEvents()` (reconstructs run state from header + event log)
- `./config` — path resolution (`resolveBaseDir()`, `resolveProjectsDir()`)
- `./parsers` — Node.js file parsers for run data
- `./scanners` — directory scanning and validation

**Package:** `@codeassembly/run-core` (private)

### MCP (`packages/mcp/`)

MCP server for orchestrated run management. Wraps run-core capabilities as five MCP tools for Claude integration.

**Package:** `@codeassembly/mcp` (private)

### Agents (`packages/agents/`)

The agents package is a CLI tool (`codeassembly-agents`) that installs reusable AI skills and subagent definitions into harness-specific directories. It also serves as the canonical home for all skill and subagent content.

**Package:** `@codeassembly/agents` (private)

**CLI commands:**

| Command             | Description                                                                                   |
| ------------------- | --------------------------------------------------------------------------------------------- |
| `generate <target>` | Scaffolds project files (`label-map`)                                                         |
| `install`           | Copies or symlinks skills and subagents into harness directories; prunes deleted-source files |
| `status`            | Shows current vs modified vs missing installed items                                          |
| `uninstall`         | Removes previously installed items (respects drift detection)                                 |

Key flags: `--harness <claude|rovodev|all>`, `--link` (symlink instead of copy), `--force` (overwrite modified), `--dry-run`.

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
    _harnesses/                    # Harness-specific skills (not installed to all harnesses)
      claude/                      # Skills installed only to Claude Code
        {skill-name}/SKILL.md
      rovodev/                     # Skills installed only to Rovo Dev
        {skill-name}/SKILL.md
        {skill-name}/              # Multi-file skills with supporting documents
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

**Skill frontmatter:** `name`, `description`, `user-invocable` (true = directly invocable, false = internal/referenced by other skills).

**Subagent frontmatter:** `name`, `description`, `tools` (allowed tools), `maxTurns`, `skills` (injected skill references).

**Harness overlay mechanism:** `claude.yaml` and `rovodev.yaml` contain per-agent frontmatter overrides (plus `_defaults`). During install, the CLI merges matching keys into each subagent's frontmatter using key-level replacement.

**Harness-specific skills:** Directories prefixed with `_` under `skills/` (e.g., `_data`, `_harnesses`) are not regular skills and are not installed directly. Skills in `_harnesses/{harnessId}/` are installed only when the install target matches that harness. For Rovo Dev, the CLI also generates `~/.rovodev/prompts.yml` as a skill discovery file, listing all user-invocable skills (skills with `user-invocable: false` are excluded).

#### Content authoring

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

Foundation library for knowledge-base tooling, consumed by the `kb-retrieve` and `kb-add` skills, the planned `kb-curate` skill, and the planned `@codeassembly/kb-mcp` server. Exposes five subpath entries — `discovery`, `schema`, `frontmatter`, `tags`, `rules` — covering KB discovery and `kb.yaml` registry loading, default-schema resolution with per-store `recordTypes:` overrides, note frontmatter parsing and writing, tag canonicalization, and a composable validation-rule engine.

**Package:** `@codeassembly/kb` (private)

The package README documents the `kb.yaml` configuration schema and merge semantics, the default schema, and the error model — consult it before declaring a KB or consuming the library.

## Common commands

**Root-level development (via `@williamthorsen/nmr`):**

- `pnpm install` - Install all dependencies
- `nmr check` - Run typecheck, format check, lint check, and tests
- `nmr check:strict` - Strict checks including coverage and audit
- `nmr ci` - Full CI pipeline (strict checks + build)
- `nmr build` - Build all packages
- `nmr test` - Run tests across all packages
- `nmr lint` - Fix lint in all packages
- `nmr lint:check` - Check for lint in all packages
- `nmr typecheck` - TypeScript check all packages
- `nmr root:test` - Run only root-level tests (in `__tests__/`)
- `nmr root:lint` - Lint only root-level files

**Workspace packages (via nmr):**

- `nmr build` - Build the package
- `nmr test` - Run tests
- `nmr test:watch` - Run tests in watch mode
- `nmr test:coverage` - Run tests with coverage
- `nmr lint` - Fix lint
- `nmr lint:check` - Check for lint
- `nmr typecheck` - TypeScript check

**Factory package (`packages/factory/`):**

- `pnpm run dev` - Start both Express server and Vite dev server
- `pnpm run dev:server` - Start Express server only (with tsx --watch)
- `pnpm run dev:client` - Start Vite dev server only

**Agents package (`packages/agents/`):**

- `pnpm run build` - Compile TypeScript + copy content to dist

## Architecture

### Root-level tests

- Located in `__tests__/` directory
- Consistency checks (Node.js and pnpm version alignment) via `@williamthorsen/nmr/tests`
- Use Vitest with config in `vitest.root.config.ts`

### Workspace script system

- Centralized script management via `@williamthorsen/nmr`
- Run workspace scripts with `nmr {command}` (e.g., `nmr test`, `nmr build`)
- Default scripts (build, test, lint, typecheck, etc.) provided by nmr
- Package-specific overrides in each package's `package.json`

### Build system

- Uses esbuild via custom `config/build.ts` for TypeScript packages
- Intelligent caching based on content hashes
- Automatic `.ts` to `.js` extension rewriting
- Alias resolution support (`~src/` -> `src/`)
- Factory uses Vite with `@vitejs/plugin-react` for the web app

### TypeScript

- Strict mode across all packages (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitReturns`)
- `moduleResolution: NodeNext`, `target: ES2022`
- Type checking via `tsgo` (`@typescript/native-preview`) for speed

### Testing

- Vitest across all packages with shared configuration
- Base config in `config/vitest.config.ts`
- Coverage reporting with v8 provider
- Package-specific configurations for different test types

### Code quality

- ESLint with `@williamthorsen/eslint-config-typescript`
- Prettier for formatting
- TypeScript strict mode
- Optional strict linting with `@williamthorsen/strict-lint`

## Skills

Always invoke the `typescript-conventions` skill before writing or modifying TypeScript code.

## Dependency management

- Use exact versions in package.json (no `^` or `~` range indicators)

## Reference documents

- `docs/pixel-agents-analysis.md` - Architectural analysis of [pablodelucca/pixel-agents](https://github.com/pablodelucca/pixel-agents), a related project that visualizes agents as pixel-art characters. Contains findings on animation techniques, sprite systems, state management, and streaming patterns relevant to Factory's development.
