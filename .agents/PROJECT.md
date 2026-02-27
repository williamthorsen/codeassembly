# CodeAssembly monorepo

## Project structure

This is a Pnpm monorepo centered around agentic code-orchestration flows.

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
