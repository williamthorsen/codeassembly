import { type ChangeRecord, dropIncidentalRoot, splitScopes } from '@williamthorsen/change-grammar';

import type { ChangeEntry } from './change-entries.ts';
import { BREAKING_LABEL, type LabelMap, type LabelSection } from './read-label-map.ts';

/**
 * Resolves the labels for a change from its effective record and its entries: the type label of every type that either
 * names, `breaking` when either is breaking, and the scope label of every scope that either names. Type labels precede
 * `breaking`, which precedes the scope labels; within each group the record's label leads, then the entries' labels
 * in the order that the entries name them, each label once.
 *
 * `resolveLabels` sets `root` aside from the entries' scopes when they also name a workspace, as `consolidate` does,
 * but keeps the workspace of a process-tier entry, which `consolidate` sets aside: A label names every workspace that
 * the branch changed. The record's scope is labeled as given, since it is either already consolidated or an explicit
 * override.
 *
 * A type or scope that the map does not name, and a scope of `*`, do not contribute a label. A map that does not
 * configure any label at all yields none, `breaking` included, since a repository without a label map does not have
 * any labels to apply.
 */
export function resolveLabels(input: LabelInput): string[] {
  const { entries, labelMap, record } = input;
  if (isUnconfigured(labelMap)) {
    return [];
  }

  const keys = collectKeys(input);
  const isBreaking = record.breaking === true || entries.some((entry) => entry.breaking);
  const labels = [
    ...lookUpLabels(labelMap.types, keys.types),
    ...(isBreaking ? [BREAKING_LABEL] : []),
    ...lookUpLabels(labelMap.scopes, keys.scopes),
  ];
  return [...new Set(labels)];
}

/**
 * Finds each type and scope that the change names and that a configured map does not define, each once and in the
 * order that `resolveLabels` reads them. A map that does not configure any label reports none, since such a repository
 * does not apply any labels.
 */
export function findUnmappedKeys(input: LabelInput): { scopes: string[]; types: string[] } {
  if (isUnconfigured(input.labelMap)) {
    return { scopes: [], types: [] };
  }
  const keys = collectKeys(input);
  return {
    scopes: findMissingKeys(input.labelMap.scopes, keys.scopes),
    types: findMissingKeys(input.labelMap.types, keys.types),
  };
}

/** What a change's labels are resolved from. */
export interface LabelInput {
  entries: readonly ChangeEntry[];
  labelMap: LabelMap;
  record: ChangeRecord;
}

// region | Helpers

/** Lists the type keys and the scope keys that the record and the entries name, the record's first. */
function collectKeys(input: LabelInput): { scopes: Array<string | undefined>; types: Array<string | undefined> } {
  const { entries, record } = input;
  return {
    scopes: [
      record.scope,
      ...dropIncidentalRoot(entries.flatMap((entry) => entry.scopes.flatMap((scope) => splitScopes(scope)))),
    ],
    types: [record.type, ...entries.map((entry) => entry.type)],
  };
}

/** Lists each trimmed key that the section does not define, skipping an absent key, an empty one, and `*`. */
function findMissingKeys(section: LabelSection, keys: ReadonlyArray<string | undefined>): string[] {
  const missing = keys.flatMap((key) => {
    const trimmed = key?.trim();
    return trimmed === undefined || trimmed === '' || trimmed === '*' || Object.hasOwn(section, trimmed) ? [] : trimmed;
  });
  return [...new Set(missing)];
}

/** Reports whether the map does not configure any label in either section. */
function isUnconfigured(labelMap: LabelMap): boolean {
  return Object.keys(labelMap.types).length === 0 && Object.keys(labelMap.scopes).length === 0;
}

/** Maps each key to the label that the section names for it, skipping a key that is absent, `*`, or unmapped. */
function lookUpLabels(section: LabelSection, keys: ReadonlyArray<string | undefined>): string[] {
  return keys.flatMap((key) => {
    const trimmed = key?.trim();
    const label =
      trimmed === undefined || trimmed === '*' || !Object.hasOwn(section, trimmed) ? undefined : section[trimmed];
    return label === undefined ? [] : label;
  });
}

// endregion | Helpers
