# codeassembly-run-core

The domain model and parsers for CodeAssembly's orchestrated development runs. Given a run directory in any of the three formats that runs have written, it returns one `CanonicalRunStatus`.

```ts
import { parseRunData } from 'codeassembly-run-core/parsers';

const run = await parseRunData('path/to/run');
run.status; // 'in_progress' | 'completed' | 'failed' | 'needs_manual_review'
```

## Entry points

The root entry imports no Node.js API, so a browser build can use its types, schemas, and `foldEvents()`. Everything that reads the filesystem or the environment sits behind a subpath.

| Entry        | Contents                                                                                  | Environment |
| ------------ | ----------------------------------------------------------------------------------------- | ----------- |
| `.`          | Types, constants, Zod schemas, `foldEvents()`, `RunDataParseError`, `isEnoent()`          | Any         |
| `./config`   | `resolveBaseDir()` and `resolveProjectsDir()`, which resolve the artifact directories     | Node.js     |
| `./parsers`  | `parseRunData()`, and `parseRunRawData()` for a v3 run's header and events before folding | Node.js     |
| `./scanners` | `discoverRunDirectories()` and `validateRunDirectory()`                                   | Node.js     |

The `run-index.json` format is specified in [artifact conventions](https://github.com/williamthorsen/codeassembly/blob/main/packages/agents/content/skills/_data/artifact-conventions.md#run-indexjson).
