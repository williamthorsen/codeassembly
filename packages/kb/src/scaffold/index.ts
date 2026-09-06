// Subpath barrel for @williamthorsen/kb/scaffold.
//
// The canonical set of files and directories a store holds, and the idempotent writer over it that `kb create` and
// `kb scaffold` share.

export { renderAliasesSeed, renderConfigSeed } from './render-seeds.ts';
export { scaffold, type ScaffoldAction, type ScaffoldEntry } from './scaffold.ts';
