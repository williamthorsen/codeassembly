import { readFile } from 'node:fs/promises';

import type { ChangeRecord } from '../change-grammar/types.ts';
import { isMissingFile, isRecord } from '../lib/type-guards.ts';

/**
 * Reads a repository's label map into its `types` and `scopes` sections, each mapping a work type or scope to the label
 * that names it. A map that is absent or unparseable, and a section that it does not declare, read as empty: a
 * repository that configures no map has no label to resolve, which is a missing signal rather than a failure.
 */
export async function readLabelMap(path: string): Promise<LabelMap> {
  let content: string;
  try {
    content = await readFile(path, 'utf8');
  } catch (error) {
    if (isMissingFile(error)) {
      return { scopes: {}, types: {} };
    }
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { scopes: {}, types: {} };
  }
  if (!isRecord(parsed)) {
    return { scopes: {}, types: {} };
  }
  return { scopes: readSection(parsed.scopes), types: readSection(parsed.types) };
}

/**
 * Resolves the head that a pull request's labels name: a type and a scope, each under the one-distinct-value rule, and
 * `breaking` where the `breaking` label that `create-pr` applies is present.
 */
export function resolveLabeledHead(map: LabelMap, labels: readonly string[]): ChangeRecord {
  const scope = resolveLabelKey(map.scopes, labels);
  const type = resolveLabelKey(map.types, labels);
  return {
    ...(labels.includes(BREAKING_LABEL) && { breaking: true }),
    ...(scope !== undefined && { scope }),
    ...(type !== undefined && { type }),
  };
}

/**
 * Resolves the one key that a section's labels name, by inverting the section and intersecting it with the labels.
 *
 * Yields nothing where the labels name no key and where they name more than one. Two type labels on one ticket say
 * that nobody has decided which it is, and picking either would record a decision that no one made.
 */
export function resolveLabelKey(section: LabelSection, labels: readonly string[]): string | undefined {
  const matched = new Set<string>();
  for (const label of labels) {
    for (const [key, name] of Object.entries(section)) {
      if (name === label) {
        matched.add(key);
      }
    }
  }

  const [only] = matched;
  return matched.size === 1 ? only : undefined;
}

/** A label map's two sections. */
export interface LabelMap {
  scopes: LabelSection;
  types: LabelSection;
}

/** One label-map section: each work type or scope, keyed to the label that names it. */
export type LabelSection = Readonly<Record<string, string>>;

// region | Helpers

/** The label that marks a breaking change. */
const BREAKING_LABEL = 'breaking';

/** Reads one section, dropping every entry whose label is not a string; anything but a mapping reads as empty. */
function readSection(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }
  const section: Record<string, string> = {};
  for (const [key, name] of Object.entries(value)) {
    if (typeof name === 'string') {
      section[key] = name;
    }
  }
  return section;
}

// endregion | Helpers
