# CodeAssembly monorepo

## Repository visibility

This repository is public. Anything committed here is world-readable, so it must not contain any credential, personal detail, or workplace-internal fact. The `private: true` markers on the package manifests say only that a package is not published to a registry; they say nothing about who can read the source.

## Packages

A pnpm monorepo of CodeAssembly packages: the `codeassembly` CLI, which deploys agent guidance, its supporting packages, and the agent-logic model. Each package's own README describes its internals. The guidance library that the CLI deploys lives in [williamthorsen/codeassembly-guidance](https://github.com/williamthorsen/codeassembly-guidance), and this repository consumes it as the published `codeassembly-guidance` package.

- **agent-logic** (`packages/agent-logic/`): The agent-logic model of a prompt's states and transitions, with React and server entries for the apps that present it, published as `codeassembly-agent-logic`. See `packages/agent-logic/README.md`.
- **agents** (`packages/agents/`): The `codeassembly` CLI, which deploys guidance from declared content sources. See `packages/agents/README.md`.
- **kb** (`packages/kb/`): Knowledge-base foundation library. See `packages/kb/README.md`.
- **run-core** (`packages/run-core/`): Canonical domain model, schemas, and run-data parsing. See `packages/run-core/README.md`.

None of the packages here depends on another package here. None reads anything from guidance, except the agent-logic corpus scorer, which is not published and hashes the pinned `convert-agent-prompt` skill.

## Content authoring

Guidance content is authored in the guidance repository. The contract that any content root follows, which the CLI here implements, is the `codeassembly-content-specification` rulebook (the `consult-codeassembly-content-specification` skill), at `packages/guidance/content/guidance/rulebooks/codeassembly-content-specification.md` in that repository.

## Gotchas

- `pnpm run bootstrap` builds every package, then deploys current guidance into the worktree's harness directories. The CLI bins do not run until it has. `pnpm run agents:sync` does the deploy half alone.
- The guidance deployed here is the version that the root `package.json` pins. A guidance change reaches this repository's harness directories only once that pin is upgraded and `pnpm run agents:sync` runs.
- A guidance upgrade that changes `convert-agent-prompt`, or an edit to `packages/agent-logic/docs/extraction-rules.md`, fails the agent-logic scorecard test until every corpus result is rechecked; see `packages/agent-logic/docs/corpus.md`. Run `pnpm run score-corpus` rather than `nmr score-corpus`, because nmr can run it on another machine, which then writes the scorecard there.
- Deleting `dist/` does not force a rebuild. Because the `nmr-compile` cache is in `node_modules/.cache/nmr-compile/` and is keyed on inputs alone, the rebuild skips and leaves `dist/` empty. Clear the cache too. Tracked upstream at williamthorsen/node-monorepo-tools#470.
- A package has a `vitest.config.ts` only when it configures something of its own; every other package runs against the repo-root config, which nmr's `nmr-vitest` names with `--config` because Vitest 5 doesn't look in parent directories. A bare `vitest` started from such a package needs the same flag; see `node_modules/@williamthorsen/nmr/docs/vitest.md`. nmr's Vitest factory supplies the git-isolation setup file, so the configs here don't declare it. It leaves `resolve.tsconfigPaths` to the consumer, which needs it only once a tsconfig declares `paths`; none here does.
- Because the root `tsconfig.json` names `"types": ["node"]`, every package declares `@types/node` as `catalog:`. TypeScript 6 doesn't include any ambient `@types` package automatically, and naming one here excludes the rest: An `@types/*` supplying globals doesn't take effect until that list includes it.
- Every package's `eslint.config.ts` extends the repo-root `eslint.config.ts`, which contains the `import-x/resolver-next` settings that `eslint-plugin-import-x` reads. A config importing `@williamthorsen/eslint-config-typescript` directly still runs `import-x/extensions` at `error`, but with nothing to resolve against, the rule accepts a `.js` specifier naming a `.ts` file.
- The `run-index.json` schema is specified in `packages/run-core/docs/run-data-format.md` and implemented as Zod schemas in `packages/run-core/src/schemas/`. Nothing ties the two mechanically; change them together.
- Use exact dependency versions in `package.json`, without `^` or `~` range indicators. A dependency shared by two or more manifests is pinned once in `pnpm-workspace.yaml`'s `catalog:` block, with every consumer declaring `catalog:`. Taking on a cataloged dependency means declaring `catalog:`, never re-pinning the literal.
- `pnpm-workspace.yaml` applies pnpm's 24-hour `minimumReleaseAge` to every package except those that its `minimumReleaseAgeExclude` names. `nmr upgrade` proposes a release once it clears that age. `nmr upgrade --maturity-period <days>` sets one period for every dependency for that call; a period below 1 day also needs `pnpm --config.minimum-release-age=0 install`, because pnpm otherwise refuses a release younger than 24 hours.
- Prettier here formats shell scripts and Dockerfiles, so `nmr fmt` covers them and the repo doesn't run a separate `shfmt` step.
