# CodeAssembly monorepo

## Repository visibility

This repository is public. Anything committed here is world-readable, so it must not contain any credential, personal detail, or workplace-internal fact. The `private: true` markers on the package manifests say only that a package is not published to a registry; they say nothing about who can read the source.

## Packages

A pnpm monorepo centered on deploying agent guidance: the `codeassembly` CLI, the guidance library that it deploys, and their supporting packages. Each package's own README describes its internals.

- **agents** (`packages/agents/`): The `codeassembly` CLI, which deploys guidance from declared content sources. See `packages/agents/README.md`.
- **factory** (`packages/factory/`): Dormant demo visualization of run data. See `packages/factory/README.md`.
- **guidance** (`packages/guidance/`): The `codeassembly-guidance` library of rulebooks, skills, and subagents, with the helpers that its skills run. See `packages/guidance/README.md`.
- **kb** (`packages/kb/`): Knowledge-base foundation library. See `packages/kb/README.md`.
- **run-core** (`packages/run-core/`): Canonical domain model, schemas, and run-data parsing. See `packages/run-core/README.md`.

The dependency chain: factory depends on run-core, and guidance on agents and kb. Guidance reaches agents only through the `codeassembly` CLI and `codeassembly/api`, and agents does not read anything from guidance.

## Content authoring

When authoring a skill, subagent, rulebook, or collection, consult `packages/guidance/content/guidance/rulebooks/codeassembly-content-specification.md` (the `consult-codeassembly-content-specification` skill) for the contract that any content root follows, and `.agents/content/guidance/rulebooks/codeassembly-repo-conventions.md` (the `consult-codeassembly-repo-conventions` skill) for the conventions that apply to the library in this repository.

Content appearing identically in two or more skill or subagent files belongs in a partial. The expander inlines partials at install time to byte-identical output, so they are the correct DRY mechanism even when verbatim execution context is a requirement. See `packages/guidance/content/_partials/README.md`.

## Gotchas

- `pnpm run bootstrap` builds every package, then deploys current guidance into the worktree's harness directories. The CLI bins do not run until it has. `pnpm run agents:sync` does the deploy half alone.
- The helper bundles under `packages/guidance/content/` are tracked build output, so a helper edit is committed together with its rebuilt bundle. `nmr -F codeassembly-guidance build` regenerates them, and `nmr check:strict` fails on a bundle that is stale or not produced by any helper declared in `packages/guidance/content/codeassembly-content.yaml`.
- `packages/guidance/content/skills/_data/work-types.json` is also build output, written from `@williamthorsen/change-grammar`'s `CANONICAL_TAXONOMY`. Change a work type in that package, not in the file. The same build regenerates the file, and `nmr check:strict` fails on a stale copy.
- Deleting `dist/` does not force a rebuild. Because the `nmr-compile` cache is in `node_modules/.cache/nmr-compile/` and is keyed on inputs alone, the rebuild skips and leaves `dist/` empty. Clear the cache too. Tracked upstream at williamthorsen/node-monorepo-tools#470.
- A package has a `vitest.config.ts` only when it configures something of its own; every other package resolves the repo-root config by walking up. nmr's Vitest factory supplies the `source` resolve conditions and the git-isolation setup file, so the configs here don't declare either. It leaves `resolve.tsconfigPaths` to the consumer; every config here declares it.
- Because the root `tsconfig.json` names `"types": ["node"]`, every package declares `@types/node` as `catalog:`. TypeScript 6 doesn't include any ambient `@types` package automatically, and naming one here excludes the rest: An `@types/*` supplying globals doesn't take effect until that list includes it.
- Every package's `eslint.config.ts` extends the repo-root `eslint.config.ts`, which contains the `import-x/resolver-next` settings that `eslint-plugin-import-x` reads. A config importing `@williamthorsen/eslint-config-typescript` directly still runs `import-x/extensions` at `error`, but with nothing to resolve against, the rule accepts a `.js` specifier naming a `.ts` file.
- The `run-index.json` schema is specified in `packages/guidance/content/skills/_data/artifact-conventions.md` and implemented as Zod schemas in `packages/run-core/src/schemas/`. Nothing ties the two mechanically; change them together.
- Use exact dependency versions in `package.json`, without `^` or `~` range indicators. A dependency shared by two or more manifests is pinned once in `pnpm-workspace.yaml`'s `catalog:` block, with every consumer declaring `catalog:`. Taking on a cataloged dependency means declaring `catalog:`, never re-pinning the literal.
- Prettier here formats shell scripts and Dockerfiles, so `nmr fmt` covers them and the repo doesn't run a separate `shfmt` step.
