<!-- readme-type: monorepo-root -->

# CodeAssembly

A pnpm monorepo for deploying agent guidance: the `codeassembly` CLI that installs skills, subagents, and rulebooks into agent harnesses, and its supporting packages. The guidance library that the CLI deploys is [`codeassembly-guidance`](https://github.com/williamthorsen/codeassembly-guidance).

## For AI agents

See [`AGENTS.md`](AGENTS.md) for the package inventory and the repo's gotchas. Each package's own README describes its internals.

## Quick start

The checks run the agents package's shell tests under [shellspec](https://github.com/shellspec/shellspec), so install it first: `brew install shellspec`. CI pins 0.28.1; keep the local install at that version.

```bash
pnpm install
pnpm run bootstrap   # Build every package and deploy current guidance; required before running the CLI bins
pnpm exec nmr check  # Run all checks (typecheck, format, lint, test)
```

To deploy guidance on a developer machine from the `live` worktree, see [Deploying guidance from the live worktree](https://github.com/williamthorsen/codeassembly-guidance/blob/main/docs/live-deployment.md) in the guidance repository.
