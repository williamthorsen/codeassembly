export { buildVaultIndex, type VaultIndex } from './build-vault-index.ts';
export {
  checkVaultIntegrity,
  type ForeignStore,
  type VaultIntegrityNote,
  type VaultIntegrityOptions,
} from './check-vault-integrity.ts';
export {
  countNewlines,
  extractTarget,
  hasNonMarkdownExtension,
  lookupKey,
  maskFencedCode,
  maskInlineCode,
  type QualifiedTarget,
  type ScannedWikilink,
  scanWikilinks,
  splitStoreQualifier,
  WIKILINK,
} from './wikilink-parse.ts';
