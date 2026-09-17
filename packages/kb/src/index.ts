// Root entry point of @williamthorsen/kb. Most of the behavioral surface is exported from the subpath entries, so that
// a consumer loads only the module that it needs.

export type {
  AliasMap,
  Finding,
  FindingSeverity,
  Frontmatter,
  FrontmatterRaw,
  KbRegistry,
  KbRegistryEntry,
  KbRoot,
  ParsedNote,
} from './types.ts';

export { buildVaultIndex, type VaultIndex } from './vault-integrity/build-vault-index.ts';
