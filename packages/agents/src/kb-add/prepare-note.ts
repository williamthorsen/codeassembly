import type { AliasMap, Finding, Frontmatter, Schema } from '@codeassembly/kb';
import { parseNoteContent, writeFrontmatter } from '@codeassembly/kb/frontmatter';
import { frontmatterRule, runRules } from '@codeassembly/kb/rules';
import { canonicalize } from '@codeassembly/kb/tags';

import { dedupeInOrder, formatUtcDate } from '../kb-shared/note-helpers.ts';
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
 * `frontmatterRule` from kb. Every note carries `recordType: assertion` as the stored discriminant — `kb-add` only
 * writes assertions. Any Diátaxis label the agent supplies via `--diataxis` is a vault facet, written to the note's
 * `extra` fields rather than a top-level field.
 *
 * Validation is performed by round-tripping the rendered frontmatter through `parseNoteContent` and feeding the parsed
 * note through `runRules`. The round trip is the cheapest way to give the rule a real `ParsedNote` carrying valid
 * `frontmatterRaw` and an actual `yaml.Document` without reaching into kb internals.
 *
 * When any finding has `severity: 'error'`, the outcome is `{ ok: false, findings }` and nothing is written.
 */
export function prepareNote(input: { args: ParsedArgs; schema: Schema; aliases: AliasMap; now: Date }): PrepareOutcome {
  const { args, schema, aliases, now } = input;

  const originalTags = [...args.tags];
  // Canonicalization can collapse distinct inputs (`node.js`, `node`) onto the same canonical (`nodejs`). Keep the
  // original list intact for the audit trail and deduplicate the written tag list in first-occurrence order so the
  // note doesn't ship `['nodejs', 'nodejs']`.
  const canonicalTags = dedupeInOrder(originalTags.map((tag) => canonicalize(tag, aliases)));
  const today = formatUtcDate(now);

  const extra: Record<string, unknown> = {};
  if (args.diataxis !== null) {
    extra.diataxis = args.diataxis;
  }
  if (args.lastVerified !== null) {
    extra['last-verified'] = args.lastVerified;
  }

  const frontmatter: Frontmatter = {
    title: args.title,
    recordType: 'assertion',
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

/** Renders the frontmatter to a note string, re-parses it, and runs the frontmatter rule against the parsed shape. */
function validate(input: { frontmatter: Frontmatter; schema: Schema }): Finding[] {
  const rendered = writeFrontmatter({ frontmatter: input.frontmatter, body: '' });
  const parsed = parseNoteContent({ content: rendered, path: '<kb-add proposal>' });
  return runRules({ rules: [frontmatterRule], notes: [parsed], schema: input.schema });
}

// endregion | Helpers
