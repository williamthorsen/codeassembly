# Agent guidance content

This directory holds the source-of-truth guidance content that `codeassembly-agents install` renders into platform-specific files (`~/.claude/CLAUDE.md`, `~/.rovodev/AGENTS.md`, `~/.agents/AGENTS.md`).

This README is for maintainers of this directory. It is not referenced by any `<!-- include: -->` directive and is not part of the rendered output.

## `shared/AGENTS.md`

Inlined verbatim into every rendered platform guidance file via the directive expander, which means it reaches every agent invocation — including subagents — as ambient context.

## Ambient hosts: `~/.agents/GLOBAL.md` and `.agents/PROJECT.md`

A rulebook with `delivery: ambient` is not inlined into the wholesale-generated guidance files (`~/.claude/CLAUDE.md`, `~/.rovodev/AGENTS.md`, `~/.agents/AGENTS.md`), which `install`/`sync` rewrite in full. Instead `sync` inlines its body into a scope-specific _ambient host_, wrapped in `<!-- rulebook:<slug> -->` … `<!-- /rulebook:<slug> -->` sentinels:

- **Home / all-projects scope** (`sync --global`) → `~/.agents/GLOBAL.md`
- **Project scope** (`sync`) → `.agents/PROJECT.md`

Agents load these hosts via the bridge lines in `shared/AGENTS.md` (`Read ~/.agents/GLOBAL.md (if it exists) …`, `Read .agents/PROJECT.md (if it exists) …`), so ambient rulebooks reach every harness without any content landing in the generated files.

`sync` only ever rewrites the sentinel-delimited blocks (`sentinel-inliner.ts`): it inserts or replaces one block per currently-ambient rulebook and removes blocks whose rulebook is no longer ambient. Content outside the markers is preserved untouched, so an ambient host doubles as a safe home for hand-written, machine-local (`GLOBAL.md`) or project-local (`PROJECT.md`) guidance. A host with no ambient rulebooks deployed is simply empty — which is the usual state until a rulebook opts into `ambient` delivery.
