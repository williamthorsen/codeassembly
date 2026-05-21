import type { FrontmatterDocument } from '../frontmatter/yaml-position.ts';
import type { AliasMap, Finding, ParsedNote, Schema } from '../types.ts';

// The contract for a knowledge-base validation rule. A rule is a plain object so the future `kb-mcp` server can
// compose a rule set declaratively; `check` takes a single object input and returns findings rather than throwing.

/** The input a rule receives for a single note. */
export interface KbRuleInput {
  /** The note under validation. */
  note: ParsedNote;
  /**
   * The raw `yaml.Document` and slice metadata for the note's frontmatter, or `null` when the note has no frontmatter
   * block. Rules use this to report findings at accurate source line numbers.
   */
  document: FrontmatterDocument | null;
  /** The effective schema the note is validated against. */
  schema: Schema;
  /** The tag-alias map; `undefined` when no aliases are configured. */
  aliases?: AliasMap;
}

/** A composable validation rule. */
export interface KbRule {
  /** A stable rule name, e.g. `frontmatter`. */
  name: string;
  /** Inspect one note and return zero or more findings. */
  check(input: KbRuleInput): Finding[];
}
