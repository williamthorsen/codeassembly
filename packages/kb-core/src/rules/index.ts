export { buildVaultIndex } from '../index/build-vault-index.ts';
export type { Finding, FindingSeverity, VaultIndex } from '../types.ts';
export { frontmatterRule } from './frontmatter-rule.ts';
export { pathsRule } from './paths-rule.ts';
export { runRules } from './run-rules.ts';
export { tagAliasRule } from './tag-alias-rule.ts';
export type { KbRule, KbRuleInput } from './types.ts';
export {
  countNewlines,
  extractTarget,
  hasNonMarkdownExtension,
  lookupKey,
  maskFencedCode,
  maskInlineCode,
  WIKILINK,
} from './wikilink-parse.ts';
export { wikilinksRule } from './wikilinks-rule.ts';
