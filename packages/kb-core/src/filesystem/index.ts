// Subpath barrel for @codeassembly/kb-core/filesystem.
//
// Shared filesystem-existence primitives with an explicit absence policy, so that callers stop redefining
// near-identical "stat a path, treat some codes as not-found, re-throw the rest" helpers.

export { directoryExists, type ExistsOptions, pathExists } from './exists.ts';
