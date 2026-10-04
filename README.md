<!-- readme-type: monorepo-root -->

# CodeAssembly

A pnpm monorepo for deploying agent guidance: the `codeassembly` CLI that installs skills, subagents, and rulebooks into agent harnesses, the guidance library that it deploys, and their supporting packages.

## For AI agents

See [`AGENTS.md`](AGENTS.md) for the package inventory and the repo's gotchas. Each package's own README describes its internals.

## Quick start

The checks run the agents package's shell tests under [shellspec](https://github.com/shellspec/shellspec), so install it first: `brew install shellspec`. CI pins 0.28.1; keep the local install at that version.

```bash
pnpm install
pnpm run bootstrap   # Build every package and deploy current guidance; required before running the MCP server or CLI bins
pnpm exec nmr check  # Run all checks (typecheck, format, lint, test)
```
