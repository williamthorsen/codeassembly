// Root barrel for @codeassembly/kb.
//
// Re-exports the types and constants used most widely across consumers. The behavioral surface lives behind the
// subpath entries so consumers tree-shake to only the module they need.

// Shared type vocabulary
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

// Vault-integrity index
export { buildVaultIndex, type VaultIndex } from './vault-integrity/build-vault-index.ts';
