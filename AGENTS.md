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
- Every Vitest config, root and package alike, layers in `.config/vitest/shared-options.ts`. It supplies the `source` resolve conditions that let workspace packages resolve from `.ts` source without a prior build, and the setup file that keeps test git subprocesses out of the developer's global git config. A config omitting it loses both silently, so a guard beside that module fails when any config bypasses it.
- The `run-index.json` schema is specified in `packages/agents/content/skills/_data/artifact-conventions.md` and implemented as Zod schemas in `packages/run-core/src/schemas/`. Nothing ties the two mechanically; change them together.
- Use exact dependency versions in `package.json`, with no `^` or `~` range indicators. A shared dependency may instead be pinned once in `pnpm-workspace.yaml`'s `catalog:` block, with every consumer declaring `catalog:`; `@williamthorsen/toolbelt.errors` is the first. Taking on a cataloged dependency means declaring `catalog:`, never re-pinning the literal.
- Prettier here formats shell scripts and Dockerfiles, so `nmr fmt` covers them and the repo runs no separate `shfmt` step.
