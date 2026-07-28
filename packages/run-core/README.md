# @codeassembly/run-core

Core runtime library for orchestrated development runs. Provides the canonical domain model, Zod schemas, event folding, and data parsing consumed by the MCP server and Factory visualization.

## Exports

The package exposes four subpath entries:

| Entry        | Description                                                         | Environment |
| ------------ | ------------------------------------------------------------------- | ----------- |
| `.`          | Types, constants, schemas, `foldEvents()`, type guards, error class | Any         |
| `./config`   | Path resolution (`resolveBaseDir()`, `resolveProjectsDir()`)        | Node.js     |
| `./parsers`  | File parsers for run data (`run-index.json`, `run-log.jsonl`)       | Node.js     |
| `./scanners` | Directory scanning and validation for run directories               | Node.js     |

The root entry (`.`) avoids Node.js APIs so it can be used in browser builds. Node.js-specific functionality is isolated in `./config`, `./parsers`, and `./scanners`.

## CLI

The `codeassembly-runs` binary provides commands for inspecting and archiving run directories:

```
codeassembly-runs check              # list invalid run directories (default)
codeassembly-runs archive            # list and offer to move invalid directories
codeassembly-runs --path <dir>       # override the base projects directory
```

## Development

### Bin wrapper pattern

The `bin` field in `package.json` points to `bin/codeassembly-runs.js`, a committed wrapper script that dynamically imports the build output at runtime. Do not point `bin` entries directly into `dist/` — pnpm creates bin symlinks during install, and nothing compiles until `pnpm run bootstrap` runs afterward, so the target won't exist in a fresh worktree and `pnpm install` will emit confusing "Failed to create bin" warnings.

Any new `bin` entry in this monorepo should follow the same pattern. See `bin/codeassembly-runs.js` for the template, and the `@williamthorsen/node-monorepo-tools` packages for the original rationale.
