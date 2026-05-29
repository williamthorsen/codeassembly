import { join } from 'node:path';
import process from 'node:process';

import type { AliasMap, Finding, KbRoot, Schema } from '@codeassembly/kb-core';
import { frontmatterRule, pathsRule, runRules, tagAliasRule, wikilinksRule } from '@codeassembly/kb-core/rules';
import { defaultSchema, loadSchema } from '@codeassembly/kb-core/schema';
import { loadAliases } from '@codeassembly/kb-core/tags';

import { detectStaleness, vaultUsesVerification } from './detect-staleness.ts';
import { detectSupersede } from './detect-supersede.ts';
import type { EnumeratedNote } from './enumerate.ts';

/**
 * Produces the full finding set across all five detection categories for a KB:
 *
 * - `frontmatter.*` and `frontmatter.tag-alias` (from kb-core's `frontmatterRule` / `tagAliasRule`).
 * - `wikilinks.*` and `paths.*` (from kb-core's ported cross-note rules).
 * - `verification.*` (curate-local staleness, threshold `staleAfterDays`).
 * - `supersede.*` (curate-local graph validation).
 *
 * The vault index for the wikilinks rule is built inside `runRules` from the notes' paths. Findings from all
 * sources are concatenated and sorted by `path`, then `line`, then `rule`, so output is stable.
 */
export async function detectFindings(input: {
  kbPath: string;
  notes: readonly EnumeratedNote[];
  now: Date;
  staleAfterDays: number;
}): Promise<Finding[]> {
  const { kbPath, notes, now, staleAfterDays } = input;
  const kbRoot: KbRoot = { path: kbPath, kbDir: join(kbPath, '.kb'), via: 'ancestor-walk' };
  const [schema, aliases] = await Promise.all([loadSchemaWithWarning({ kbRoot }), loadAliasesWithWarning({ kbRoot })]);

  const parsedNotes = notes.map((entry) => entry.note);
  const usesVerification = vaultUsesVerification(parsedNotes, now);
  const findings: Finding[] = [
    ...runRules({
      rules: [frontmatterRule, tagAliasRule, wikilinksRule, pathsRule],
      notes: parsedNotes,
      schema,
      aliases,
    }),
    ...parsedNotes.flatMap((note) =>
      detectStaleness({ note, now, staleAfterDays, vaultUsesVerification: usesVerification }),
    ),
    ...detectSupersede(parsedNotes),
  ];

  return sortFindings(findings);
}

// region | Helpers

/** Sorts findings by path, then line, then rule, matching the ordering kb-core's parity golden uses. */
function sortFindings(findings: readonly Finding[]): Finding[] {
  return findings.toSorted((a, b) => {
    if (a.path !== b.path) return a.path < b.path ? -1 : 1;
    const lineA = a.line ?? 0;
    const lineB = b.line ?? 0;
    if (lineA !== lineB) return lineA - lineB;
    if (a.rule === b.rule) return 0;
    return a.rule < b.rule ? -1 : 1;
  });
}

/**
 * Loads the effective schema, degrading a malformed or unreadable `schema.yaml` to {@link defaultSchema} and emitting
 * a warning to stderr so a corrupt schema file does not block findings unrelated to schema validation.
 */
async function loadSchemaWithWarning(input: { kbRoot: KbRoot }): Promise<Schema> {
  try {
    return await loadSchema({ kbRoot: input.kbRoot });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`kb-curate: warning: could not load schema; using the default schema: ${message}\n`);
    return defaultSchema;
  }
}

/**
 * Loads tag aliases, degrading a malformed or unreadable `tag-aliases.yaml` to an empty map and emitting a warning
 * to stderr so the operator can see why canonicalization was skipped.
 */
async function loadAliasesWithWarning(input: { kbRoot: KbRoot }): Promise<AliasMap> {
  try {
    return await loadAliases({ kbRoot: input.kbRoot });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`kb-curate: warning: could not load tag aliases: ${message}\n`);
    return new Map();
  }
}

// endregion | Helpers
