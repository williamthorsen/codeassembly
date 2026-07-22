# Agent guidance content

This directory holds the source-of-truth guidance content that `codeassembly-agents install` renders into platform-specific files (`~/.claude/CLAUDE.md`, `~/.rovodev/AGENTS.md`, `~/.agents/AGENTS.md`).

This README is for maintainers of this directory. It is not referenced by any `<!-- include: -->` directive and is not part of the rendered output.

## `shared/AGENTS.md`

Inlined verbatim into every rendered platform guidance file via the directive expander, which means it reaches every agent invocation — including subagents — as ambient context.

## Ambient delivery: harness regions and `.agents/PROJECT.md`

A rulebook with `delivery: ambient` reaches agents mechanically, with no agent-elective read anywhere on the path. The two domains deliver differently:

- **Home / all-projects scope** (`sync --global`): the body is injected, wrapped in `<!-- rulebook:<slug> -->` sentinels, into the ambient region (`<!-- codeassembly-ambient:start -->` / `<!-- codeassembly-ambient:end -->`) inside each targeted harness's mechanically-loaded guidance file (`~/.claude/CLAUDE.md`, `~/.rovodev/AGENTS.md`). The templates in `_harnesses/` carry the empty region, so the region's location is `install`'s decision while its content is `sync`'s: `sync --global` regenerates the region wholesale each run, and `install` splices the region's content into every re-render and excludes it from drift hashing (`ambient-region.ts`). Hand edits outside the region still count as drift. Run `install` before the first `sync --global`; a guidance file that is missing or carries no region is skipped with a warning naming the fix.
- **Project scope** (`sync`): the body is inlined into the ambient host `.agents/PROJECT.md`. `sync` rewrites only the sentinel-delimited blocks (`sentinel-inliner.ts`) and preserves everything outside them, so the host doubles as a safe home for hand-written project-local guidance.

`~/.agents/GLOBAL.md` is retired as the home ambient host: `sync --global` strips the sync-owned blocks from a legacy copy and deletes the file once nothing hand-written remains. For machine-local guidance that should stay out of source control, declare a machine-local source in `~/.agents/codeassembly.yaml` (a directory shaped like the library's `content/`, with rulebooks at `guidance/rulebooks/<slug>.md`) and give the rulebook `delivery: ambient`; it then rides the same injection as library rulebooks.
