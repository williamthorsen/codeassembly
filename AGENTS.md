# CodeAssembly monorepo

## Repository visibility

This repository is public. Anything committed here is world-readable, so no credential, personal detail, or workplace-internal fact belongs in it. The `private: true` markers on the package manifests say only that a package is not published to a registry; they say nothing about who can read the source.

## Packages

A pnpm monorepo centered on agentic code-orchestration flows. Each package's own README carries its internals.

- **agents** (`packages/agents/`): the `codeassembly` CLI and the library of rulebooks, skills, and subagents it deploys. See `packages/agents/README.md`.
- **factory** (`packages/factory/`): dormant demo visualization of orchestration runs. See `packages/factory/README.md`.
- **fleet** (`packages/fleet/`): server of the fleet-visibility stack. See `packages/fleet/README.md`.
- **foreman** (`packages/foreman/`): client app of the fleet-visibility stack. See `packages/foreman/README.md`.
- **kb** (`packages/kb/`): knowledge-base foundation library. See `packages/kb/README.md`.
- **lifecycle** (`packages/lifecycle/`): session-lifecycle event envelope, vocabulary, and lane fold. See `packages/lifecycle/README.md`.
- **mcp** (`packages/mcp/`): MCP server exposing run management over run-core. Its five tools carry their own descriptions in `packages/mcp/src/server.ts`.
- **run-core** (`packages/run-core/`): canonical domain model, schemas, and run-data parsing. See `packages/run-core/README.md`.

The dependency chain: mcp and factory depend on run-core, fleet on lifecycle, foreman on fleet, and agents on both kb and lifecycle.

## Content authoring

When authoring a skill, subagent, rulebook, or collection, consult `packages/agents/content/guidance/rulebooks/codeassembly-content-specification.md` (the `consult-codeassembly-content-specification` skill).

Content appearing identically in two or more skill or subagent files belongs in a partial. The expander inlines partials at install time to byte-identical output, so they are the correct DRY mechanism even where verbatim execution context is a requirement. See `packages/agents/content/_partials/README.md`.

## Gotchas

- `pnpm run bootstrap` builds every package, then deploys current guidance into the worktree's harness directories. The MCP server and the CLI bins do not run until it has. `pnpm run agents:sync` does the deploy half alone.
- Deleting `dist/` does not force a rebuild. The `nmr-compile` cache lives in `node_modules/.cache/nmr-compile/` and is keyed on inputs alone, so the rebuild skips and leaves `dist/` empty. Clear the cache too. Tracked upstream at williamthorsen/node-monorepo-tools#470.
- A package carries a `vitest.config.ts` only where it configures something of its own; every other package resolves the repo-root config by walking up. nmr's Vitest factory supplies the `source` resolve conditions and the git-isolation setup file, so no config declares either. It leaves `resolve.tsconfigPaths` to the consumer, so every config here declares it.
- The root `tsconfig.json` names `"types": ["node"]`, so every package declares `@types/node` as `catalog:`. TypeScript 6 includes no ambient `@types` package automatically, and naming one here excludes the rest: an `@types/*` supplying globals has no effect until it joins that list.
- Every package's `eslint.config.ts` extends the repo-root `eslint.config.ts`, which carries the `import/resolver` settings. A config importing `@williamthorsen/eslint-config-typescript` directly still runs `import/extensions` at `error`, but with nothing to resolve against, the rule accepts a `.js` specifier naming a `.ts` file and the gate stays green. A guard in `.config/__tests__/` fails when any package config bypasses the root.
- The `run-index.json` schema is specified in `packages/agents/content/skills/_data/artifact-conventions.md` and implemented as Zod schemas in `packages/run-core/src/schemas/`. Nothing ties the two mechanically; change them together.
- Use exact dependency versions in `package.json`, with no `^` or `~` range indicators. A dependency two or more manifests share is pinned once in `pnpm-workspace.yaml`'s `catalog:` block, with every consumer declaring `catalog:`. Taking on a cataloged dependency means declaring `catalog:`, never re-pinning the literal. A guard in `.config/__tests__/` fails on either violation.
- Prettier here formats shell scripts and Dockerfiles, so `nmr fmt` covers them and the repo runs no separate `shfmt` step.
