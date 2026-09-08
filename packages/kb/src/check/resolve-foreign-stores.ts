import { stat } from 'node:fs/promises';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { isAtLeastAsShareable, type StoreVisibility } from '../config/config-schema.ts';
import { loadKbConfig } from '../config/load-config.ts';
import { resolveKbDir } from '../layout/index.ts';
import type { KbRegistry } from '../types.ts';
import { buildVaultIndex } from '../vault-integrity/build-vault-index.ts';
import type { ForeignStore } from '../vault-integrity/check-vault-integrity.ts';
import {
  extractTarget,
  hasNonMarkdownExtension,
  maskFencedCode,
  maskInlineCode,
  splitStoreQualifier,
  WIKILINK,
} from '../vault-integrity/wikilink-parse.ts';
import { enumerateNotePaths } from './enumerate.ts';

/**
 * Collects the distinct store names that a note set's wikilinks qualify, so a check run consults only the stores its
 * own links reach. Bodies are masked for fenced and inline code first, matching how the links are later evaluated, so
 * a store-shaped prefix inside a code sample pulls in no store.
 */
export function collectStorePrefixes(notes: readonly { body: string }[]): Set<string> {
  const prefixes = new Set<string>();
  for (const note of notes) {
    const body = maskInlineCode(maskFencedCode(note.body));
    for (const match of body.matchAll(WIKILINK)) {
      const inner = match[1];
      if (inner === undefined) continue;
      const target = extractTarget(inner);
      if (target === null) continue;
      if (hasNonMarkdownExtension(target)) continue;
      const { store } = splitStoreQualifier(target);
      if (store !== undefined) prefixes.add(store);
    }
  }
  return prefixes;
}

/**
 * Resolves each store name a run's links qualify against the merged registry, reading only note paths and each store's
 * own `.kb/config.yaml`: a foreign store is enumerated under its own `targets`/`exclude` and git scope, as it would be
 * under its own check run, and no foreign note is opened.
 *
 * A store that cannot be read — absent from this machine, or carrying a config file that will not load — resolves
 * `unavailable` rather than throwing, so one unrelated store cannot fail the run.
 */
export async function resolveForeignStores(input: {
  prefixes: Iterable<string>;
  registry: KbRegistry;
  sourceVisibility: StoreVisibility;
}): Promise<Map<string, ForeignStore>> {
  const resolved = new Map<string, ForeignStore>();
  for (const prefix of input.prefixes) {
    resolved.set(prefix, await resolveOne(prefix, input.registry, input.sourceVisibility));
  }
  return resolved;
}

// region | Helpers

/** Resolves one store name, reporting why it yielded no index rather than throwing. */
async function resolveOne(
  prefix: string,
  registry: KbRegistry,
  sourceVisibility: StoreVisibility,
): Promise<ForeignStore> {
  const entry = registry.entries.find((candidate) => candidate.name === prefix);
  if (entry === undefined) return { status: 'unknown' };

  try {
    const stats = await stat(entry.path);
    if (!stats.isDirectory()) return { status: 'unavailable', reason: `${entry.path} is not a directory` };
  } catch (error) {
    return { status: 'unavailable', reason: `${entry.path} could not be read: ${describeError(error)}` };
  }

  let config;
  try {
    config = await loadKbConfig({ kbRoot: { path: entry.path, kbDir: resolveKbDir(entry.path) } });
  } catch (error) {
    return { status: 'unavailable', reason: describeError(error) };
  }

  if (!isAtLeastAsShareable({ source: sourceVisibility, target: config.visibility })) {
    return { status: 'disallowed', visibility: config.visibility };
  }

  const paths = await enumerateNotePaths({ kbRoot: entry.path, config });
  return { status: 'resolved', index: buildVaultIndex(paths.map((path) => ({ path }))) };
}

// endregion | Helpers
