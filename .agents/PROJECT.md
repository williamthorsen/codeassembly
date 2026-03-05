# CodeAssembly monorepo

## Project structure

This is a pnpm monorepo centered around agentic code-orchestration flows. It contains two packages:

- **Agents** (`packages/agents/`) — a CLI tool and content library of reusable AI agent skills and subagent definitions that power orchestrated development workflows
- **Factory** (`packages/factory/`) — a web-based visualization that renders orchestration runs as an interactive 2D game scene

The two packages share a domain model: the orchestration skills (agents) write `run-index.json` artifacts during runs, and Factory reads and visualizes them. Co-locating both in this monorepo ensures schema changes can be made atomically.

### Agents (`packages/agents/`)

The agents package is a CLI tool (`codeassembly-agents`) that installs reusable AI skills and subagent definitions into platform-specific directories. It also serves as the canonical home for all skill and subagent content.

**Package:** `@codeassembly/agents` (private)

**CLI commands:**

| Command     | Description                                                       |
| ----------- | ----------------------------------------------------------------- |
| `install`   | Copies or symlinks skills and subagents into platform directories |
| `uninstall` | Removes previously installed items (respects drift detection)     |
| `status`    | Shows current vs modified vs missing installed items              |

Key flags: `--platform <claude|rovodev|all>`, `--link` (symlink instead of copy), `--force` (overwrite modified), `--dry-run`.

**Supported platforms:**

- **Claude Code** (`claude`) — installs into `~/.claude/skills/` and `~/.claude/agents/`
- **Rovo Dev** (`rovodev`) — installs into `~/.rovodev/skills/` and `~/.rovodev/subagents/`

**Source layout:**

```
packages/agents/
  src/
    cli.ts                         # CLI entry point (Commander-based)
    lib/
      types.ts                     # Core interfaces: PlatformId, ManifestEntry, InstallOptions
      platform.ts                  # Platform config table, detection, path resolution
      manifest.ts                  # ~/.codeassembly/agents-manifest.json; SHA-256 hashing; drift detection
      installer.ts                 # copyItem(), linkItem(), removeItem(), checkSymlinkSafety()
      content-resolver.ts          # Resolves content/ dir in dev vs built layouts
      frontmatter-merger.ts        # Parses YAML frontmatter; merges platform overrides from _data/*.yml
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
      work-types.md                # Commit work-type taxonomy
    _platforms/                    # Platform-specific skills (not installed to all platforms)
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
      claude.yml                   # Platform frontmatter overrides for Claude Code
      rovodev.yml                  # Platform frontmatter overrides for Rovo Dev
    {agent-name}.md                # Each subagent is a single .md file
```

**Skill frontmatter:** `name`, `description`, `user-invocable` (true = directly invocable, false = internal/referenced by other skills).

**Subagent frontmatter:** `name`, `description`, `tools` (allowed tools), `maxTurns`, `skills` (injected skill references).

**Platform overlay mechanism:** `claude.yml` and `rovodev.yml` contain per-agent frontmatter overrides (plus `_defaults`). During install, the CLI merges matching keys into each subagent's frontmatter using key-level replacement.

**Platform-specific skills:** Directories prefixed with `_` under `skills/` (e.g., `_data`, `_platforms`) are not regular skills and are not installed directly. Skills in `_platforms/{platformId}/` are installed only when the install target matches that platform. For Rovo Dev, the CLI also generates `~/.rovodev/prompts.yml` as a skill discovery file, listing all user-invocable skills (skills with `user-invocable: false` are excluded).

#### The orchestration system

The skills implement a multi-phase agentic development pipeline. Entry points:

- **`/orchestrate-dev`** — full workflow (default), lightweight (`--mode=vibe`), lightweight with enforcement (`--mode=lite`), or thorough (`--mode=strict`)
- **`/orchestrate-review`** — review-only workflow for manually written code

The `orchestrate` skill is the internal pipeline engine. It:

1. Generates a run ID, writes `run-manifest.md` and `run-index.json`
2. Dispatches subagents via the Task tool for each phase
3. Runs a review cycle (parallel aspect reviewers + code-simplifier + holistic review)
4. Writes `run-summary.md` and finalizes `run-index.json`

**Subagent roles:**

| Subagent                         | Phase             | Purpose                                                                |
| -------------------------------- | ----------------- | ---------------------------------------------------------------------- |
| `orchestrated-architect`         | Architecture      | Assesses architectural impact; classifies as none/low/medium/high      |
| `orchestrated-planner`           | Planning          | Creates ordered implementation plans (.md + .json)                     |
| `orchestrated-coder`             | Implementation    | Implements code, runs quality gates, commits, writes change-summary.md |
| `orchestrated-reviewer`          | Review + Holistic | Structured code review with F/W/T/R/S/L finding scheme                 |
| `aspect-code-reviewer`           | Review (parallel) | Focused on CLAUDE.md compliance, bugs, logic errors                    |
| `aspect-silent-failure-reviewer` | Review (parallel) | Focused on error-handling and silent failures                          |
| `aspect-test-reviewer`           | Review (parallel) | Focused on test coverage quality and behavioral gaps                   |
| `planner`                        | Standalone        | Breaks stories into independently orchestrable steps                   |

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

## Common commands

**Root-level development:**

- `pnpm install` - Install all dependencies
- `pnpm run check` - Run typecheck, format check, lint check, and tests
- `pnpm run check:strict` - Strict checks including coverage and audit
- `pnpm run ci` - Full CI pipeline (strict checks + build)
- `pnpm run build` - Build all packages
- `pnpm run test` - Run tests across all packages
- `pnpm run lint` - Lint all packages
- `pnpm run typecheck` - TypeScript check all packages
- `pnpm run root:test` - Run only root-level tests (in `__tests__/`)
- `pnpm run root:lint` - Lint only root-level files
- `pnpm run root:check` - Run all root-level checks

**Factory package (`packages/factory/`):**

- `pnpm run dev` - Start both Express server and Vite dev server
- `pnpm run dev:server` - Start Express server only (with tsx --watch)
- `pnpm run dev:client` - Start Vite dev server only
- `pnpm run ws build` - Build the package
- `pnpm run ws test` - Run tests
- `pnpm run ws test:watch` - Run tests in watch mode
- `pnpm run ws test:coverage` - Run tests with coverage
- `pnpm run ws lint` - Lint
- `pnpm run ws typecheck` - TypeScript check

**Agents package (`packages/agents/`):**

- `pnpm run build` - Compile TypeScript + copy content to dist
- `pnpm run ws test` - Run tests
- `pnpm run ws lint` - Lint
- `pnpm run ws typecheck` - TypeScript check

## Architecture

### Root-level tests

- Located in `__tests__/` directory
- Verify Node.js and pnpm versions match `.tool-versions`
- Use Vitest with config in `vitest.root.config.ts`

### Workspace script system

- Centralized script management via `scripts/run-workspace-script.ts`
- Each package uses `pnpm run ws {command}` for consistent tooling
- Common scripts defined in `run-workspace-script.ts` with package-level overrides
- Supports integration tests with `--int-test` flag

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

## Code descriptions

Every non-trivial function, method, class, and component must have a `/** ... */` description. One sentence is the target, but longer descriptions are fine when more explanation helps. Do not use JSDoc tags (`@param`, `@returns`, `@throws`, etc.) — the type signature already communicates parameter and return types. Describe _what_ the code does and _why_, not _how_.

Trivial code (simple getters, one-line helpers whose name fully describes their behavior) may omit the description.

```typescript
/** Resolves agent colors from role types using the CGA-16 palette. */
function resolveAgentColor(roleType: RoleType): string {
```

Not:

```typescript
/**
 * Resolves agent colors from role types using the CGA-16 palette.
 * @param roleType - The role type to look up
 * @returns The hex color string for the role type
 */
function resolveAgentColor(roleType: RoleType): string {
```

## Skills

Always invoke the `typescript-conventions` skill before writing or modifying TypeScript code.

## Dependency management

- Use exact versions in package.json (no `^` or `~` range indicators)

## Reference documents

- `docs/pixel-agents-analysis.md` - Architectural analysis of [pablodelucca/pixel-agents](https://github.com/pablodelucca/pixel-agents), a related project that visualizes agents as pixel-art characters. Contains findings on animation techniques, sprite systems, state management, and streaming patterns relevant to Factory's development.
