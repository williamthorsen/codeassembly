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
} from './types.ts';

// Default schema constant
export { defaultSchema } from './schema/default-schema.ts';

// Rule constants and the rule contract
export { frontmatterRule } from './rules/frontmatter-rule.ts';
export { tagAliasRule } from './rules/tag-alias-rule.ts';
export type { KbRule, KbRuleInput } from './rules/types.ts';
