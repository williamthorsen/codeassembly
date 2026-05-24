import type { AliasMap, Finding, Frontmatter, Schema } from '@codeassembly/kb-core';
import { parseNoteContent, writeFrontmatter } from '@codeassembly/kb-core/frontmatter';
import { frontmatterRule, runRules } from '@codeassembly/kb-core/rules';
import { canonicalize } from '@codeassembly/kb-core/tags';

import type { ParsedArgs, PreparedNote } from './types.ts';

/** Successful preparation: a fully-typed `Frontmatter` plus the canonicalization audit trail. */
export interface PrepareSuccess {
  ok: true;
  prepared: PreparedNote;
}

/** Schema-validation failure: surfaces the error-severity findings the helper turns into a structured result. */
export interface PrepareFailure {
  ok: false;
  findings: Finding[];
}

/** The outcome of preparing a note for write. */
export type PrepareOutcome = PrepareSuccess | PrepareFailure;

/**
 * Composes a typed `Frontmatter` from parsed CLI args, fills in UTC `created` and `updated` dates, canonicalizes
 * tags via the supplied alias map, and validates the result against the destination KB's schema using the
 * `frontmatterRule` from kb-core.
 *
 * Validation is performed by round-tripping the rendered frontmatter through `parseNoteContent` and feeding the parsed
 * note through `runRules`. The round trip is the cheapest way to give the rule a real `ParsedNote` carrying valid
 * `frontmatterRaw` and an actual `yaml.Document` without reaching into kb-core internals.
 *
 * When any finding has `severity: 'error'`, the outcome is `{ ok: false, findings }` and nothing is written.
 */
export function prepareNote(input: { args: ParsedArgs; schema: Schema; aliases: AliasMap; now: Date }): PrepareOutcome {
  const { args, schema, aliases, now } = input;

  const originalTags = [...args.tags];
  const canonicalTags = originalTags.map((tag) => canonicalize(tag, aliases));
  const today = formatUtcDate(now);

  const extra: Record<string, unknown> = {};
  if (args.lastVerified !== null) {
    extra['last-verified'] = args.lastVerified;
  }

  const frontmatter: Frontmatter = {
    title: args.title,
    type: args.type,
    created: today,
    updated: today,
    tags: canonicalTags,
    extra,
  };

  const findings = validate({ frontmatter, schema });
  const errorFindings = findings.filter((finding) => finding.severity === 'error');
  if (errorFindings.length > 0) {
    return { ok: false, findings: errorFindings };
  }

  return { ok: true, prepared: { frontmatter, originalTags, canonicalTags } };
}

// region | Helpers

/** Formats a `Date` as a UTC `YYYY-MM-DD` string. */
function formatUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Renders the frontmatter to a note string, re-parses it, and runs the frontmatter rule against the parsed shape. */
function validate(input: { frontmatter: Frontmatter; schema: Schema }): Finding[] {
  const rendered = writeFrontmatter({ frontmatter: input.frontmatter, body: '' });
  const parsed = parseNoteContent({ content: rendered, path: '<kb-add proposal>' });
  return runRules({ rules: [frontmatterRule], notes: [parsed], schema: input.schema });
}

// endregion | Helpers
