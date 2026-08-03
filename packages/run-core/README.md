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

The package ships no binary; it is consumed as a library.
