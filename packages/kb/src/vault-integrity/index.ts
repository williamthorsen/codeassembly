export { buildVaultIndex, type VaultIndex } from './build-vault-index.ts';
export { checkVaultIntegrity, type VaultIntegrityNote } from './check-vault-integrity.ts';
export {
  countNewlines,
  extractTarget,
  hasNonMarkdownExtension,
  lookupKey,
  maskFencedCode,
  maskInlineCode,
  WIKILINK,
} from './wikilink-parse.ts';
