import { join } from 'node:path';

import type { KbConfig } from '../config/config-schema.ts';
import { loadKbConfig } from '../config/load-config.ts';
import { frontmatterRule } from '../rules/frontmatter-rule.ts';
import { pathsRule } from '../rules/paths-rule.ts';
import { runRules } from '../rules/run-rules.ts';
import { tagAliasRule } from '../rules/tag-alias-rule.ts';
import { wikilinksRule } from '../rules/wikilinks-rule.ts';
import { loadSchema } from '../schema/load-schema.ts';
import { loadAliases } from '../tags/load-aliases.ts';
import type { Finding, KbRoot } from '../types.ts';
import { type EnumeratedNote, enumerateNotes } from './enumerate.ts';

/** The result of a check run: the effective config, every enumerated note, and every finding the rule set produced. */
export interface CheckResult {
  /** The effective `KbConfig` the run used — loaded from `.kb/config.yaml`, or `defaultKbConfig` when absent. */
  config: KbConfig;
  /** Every note enumerated under the store's `config.targets`, in walk order. */
  notes: readonly EnumeratedNote[];
  /** Findings from the four generic rules (frontmatter, tag-alias, wikilinks, paths). */
  findings: readonly Finding[];
}

/**
 * Runs the store's config-driven check: load `.kb/config.yaml`, `.kb/schema.yaml`, and `.kb/tag-aliases.yaml`,
 * enumerate notes under the config's `targets`/`exclude`, and run the four generic rules across them.
 *
 * Returns the effective config alongside the enumerated notes and findings, so a consumer (e.g. `kb-curate`) can
 * layer its own detectors over the same enumeration without walking the tree twice, and can read the resolved
 * `targets`/`exclude` without re-loading `.kb/config.yaml`.
 *
 * A structural defect in any of the three loaded files throws a `KbLoaderError` (the loaders' own contract); the
 * caller decides how to surface it. Any other error from enumeration or rule execution propagates unchanged — it is
 * never relabeled as a config defect.
 */
export async function check(input: { kbRoot: string }): Promise<CheckResult> {
  const kbRoot: KbRoot = { path: input.kbRoot, kbDir: join(input.kbRoot, '.kb'), via: 'ancestor-walk' };

  const [config, schema, aliases] = await Promise.all([
    loadKbConfig({ kbRoot }),
    loadSchema({ kbRoot }),
    loadAliases({ kbRoot }),
  ]);

  const notes = await enumerateNotes({ kbRoot: input.kbRoot, config });
  const parsedNotes = notes.map((entry) => entry.note);

  const findings = runRules({
    rules: [frontmatterRule, tagAliasRule, wikilinksRule, pathsRule],
    notes: parsedNotes,
    schema,
    aliases,
  });

  return { config, notes, findings };
}
