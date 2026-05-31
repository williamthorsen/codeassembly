// Root barrel for @codeassembly/kb-core.
//
// Re-exports the types and constants used most widely across consumers. The
// behavioral surface lives behind the five subpath entries (`./discovery`,
// `./schema`, `./frontmatter`, `./tags`, `./rules`) so consumers tree-shake to
// only the module they need.

// Shared type vocabulary
export type {
  AliasMap,
  Finding,
  FindingSeverity,
  Frontmatter,
  FrontmatterRaw,
  KbConfig,
  KbConfigEntry,
  KbRoot,
  ParsedNote,
  Schema,
  VaultIndex,
} from './types.ts';

// Error-code type guards
export { isEnoent, isErrorCode } from './type-guards.ts';

// Default schema constant
export { defaultSchema } from './schema/default-schema.ts';

// Vault index builder
export { buildVaultIndex } from './index/build-vault-index.ts';

// Rule constants and the rule contract
export { frontmatterRule } from './rules/frontmatter-rule.ts';
export { pathsRule } from './rules/paths-rule.ts';
export { tagAliasRule } from './rules/tag-alias-rule.ts';
export type { KbRule, KbRuleInput } from './rules/types.ts';
export { wikilinksRule } from './rules/wikilinks-rule.ts';
