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
} from './types.js';

// Default schema constant
export { defaultSchema } from './schema/default-schema.js';

// Rule constants and the rule contract
export { frontmatterRule } from './rules/frontmatter-rule.js';
export { tagAliasRule } from './rules/tag-alias-rule.js';
export type { KbRule, KbRuleInput } from './rules/types.js';
