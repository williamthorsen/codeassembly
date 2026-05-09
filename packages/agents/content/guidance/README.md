# Agent guidance content

This directory holds the source-of-truth guidance content that `codeassembly-agents install` renders into platform-specific files (`~/.claude/CLAUDE.md`, `~/.rovodev/AGENTS.md`, `~/.agents/AGENTS.md`).

This README is for maintainers of this directory. It is not referenced by any `<!-- include: -->` directive and is not part of the rendered output.

## `shared/AGENTS.md`

Inlined verbatim into every rendered platform guidance file via the directive expander, which means it reaches every agent invocation — including subagents — as ambient context.
