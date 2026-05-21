import { documentFor } from '../frontmatter/parse-note.ts';
import type { AliasMap, Finding, ParsedNote, Schema } from '../types.ts';
import type { KbRule } from './types.ts';

/**
 * Run a set of rules over a set of notes and return the concatenated findings.
 *
 * Iterates notes in the outer loop and rules in the inner loop, so that all findings for one note are grouped before
 * the next. An empty rule list or empty note list yields `[]`. When `aliases` is omitted, rules that depend on
 * the alias map (e.g. the tag-alias rule) no-op.
 */
export function runRules(input: {
  rules: readonly KbRule[];
  notes: readonly ParsedNote[];
  schema: Schema;
  aliases?: AliasMap;
}): Finding[] {
  const { rules, notes, schema, aliases } = input;
  const findings: Finding[] = [];

  for (const note of notes) {
    const document = documentFor(note);
    for (const rule of rules) {
      findings.push(...rule.check({ note, document, schema, ...(aliases !== undefined && { aliases }) }));
    }
  }

  return findings;
}
