# CodeAssembly

Pnpm monorepo infrastructure for agentic code-orchestration flows.

## For AI agents

See [`.agents/PROJECT.md`](.agents/PROJECT.md) for project structure, commands, and architecture.

## Quick start

```bash
pnpm install
pnpm run bootstrap   # Build every package and deploy current guidance; required before running the MCP server or CLI bins
pnpm exec nmr check  # Run all checks (typecheck, format, lint, test)
```
