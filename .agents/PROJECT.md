# CodeAssembly monorepo

## Project structure

This is a Pnpm monorepo centered around agentic code-orchestration flows.

The `packages/` directory is currently empty but the monorepo infrastructure is configured and ready for future packages.

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

**Package-level development infrastructure:**

When packages are added to `packages/`, they can use these commands from the package directory:

- `pnpm run ws {command}` - Run workspace script (unified interface)
- `pnpm run ws build` - Build current package
- `pnpm run ws test` - Run tests for current package
- `pnpm run ws test:watch` - Run tests in watch mode
- `pnpm run ws test:coverage` - Run tests with coverage
- `pnpm run ws lint` - Lint current package
- `pnpm run ws typecheck` - TypeScript check current package

## Architecture

### Root-level Tests

- Located in `__tests__/` directory
- Verify Node.js and pnpm versions match `.tool-versions`
- Use Vitest with config in `vitest.root.config.ts`

### Workspace Script System

- Centralized script management via `scripts/run-workspace-script.ts`
- Each package uses `pnpm run ws {command}` for consistent tooling
- Common scripts defined in `run-workspace-script.ts` with package-level overrides
- Supports integration tests with `--int-test` flag

### Build System

- Uses esbuild via custom `config/build.ts` for TypeScript packages
- Intelligent caching based on content hashes
- Automatic `.ts` to `.js` extension rewriting
- Alias resolution support (`~src/` → `src/`)

### Testing

- Vitest across all packages with shared configuration
- Base config in `config/vitest.config.ts`
- Coverage reporting with v8 provider
- Package-specific configurations for different test types

### Code Quality

- ESLint with `@williamthorsen/eslint-config-typescript`
- Prettier for formatting
- TypeScript strict mode
- Optional strict linting with `@williamthorsen/strict-lint`
