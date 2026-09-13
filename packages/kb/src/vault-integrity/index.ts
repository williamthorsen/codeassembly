export { buildVaultIndex, type VaultIndex } from './build-vault-index.ts';
export {
  checkVaultIntegrity,
  type ForeignStore,
  type VaultIntegrityNote,
  type VaultIntegrityOptions,
} from './check-vault-integrity.ts';
export { lookupKey, type ScannedWikilink, scanWikilinks } from './wikilink-parse.ts';
