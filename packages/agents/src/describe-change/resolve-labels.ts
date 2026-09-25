import { dropIncidentalRoot, splitScopes } from '../change-grammar/tokens.ts';
import type { ChangeRecord } from '../change-grammar/types.ts';
import type { ChangeEntry } from './change-entries.ts';
import { BREAKING_LABEL, type LabelMap, type LabelSection } from './read-label-map.ts';

/**
 * Resolves the labels for a change from its effective record and its entries: the type label of every type that either
 * names, `breaking` when either is breaking, and the scope label of every scope that either names. Type labels precede
 * `breaking`, which precedes the scope labels; within each group the record's label leads, then the entries' labels
 * in the order that the entries name them, each label once.
 *
 * The entries' scopes set `root` aside when they also name a workspace, as `consolidate` does, but keep the workspace
 * of a process-tier entry, which `consolidate` sets aside: A label names every workspace that the branch changed. The
 * record's scope is labeled as given, since it is either already consolidated or an explicit override.
 *
 * A type or scope that the map does not name, and a scope of `*`, contribute no label. A map that configures no label
 * at all yields none, `breaking` included, since a repository without a label map has no labels to apply.
 */
export function resolveLabels(input: {
  entries: readonly ChangeEntry[];
  labelMap: LabelMap;
  record: ChangeRecord;
}): string[] {
  const { entries, labelMap, record } = input;
  if (Object.keys(labelMap.types).length === 0 && Object.keys(labelMap.scopes).length === 0) {
    return [];
  }

  const isBreaking = record.breaking === true || entries.some((entry) => entry.breaking);
  const labels = [
    ...lookUpLabels(labelMap.types, [record.type, ...entries.map((entry) => entry.type)]),
    ...(isBreaking ? [BREAKING_LABEL] : []),
    ...lookUpLabels(labelMap.scopes, [
      record.scope,
      ...dropIncidentalRoot(entries.flatMap((entry) => entry.scopes.flatMap((scope) => splitScopes(scope)))),
    ]),
  ];
  return [...new Set(labels)];
}

// region | Helpers

/** Maps each key to the label that the section names for it, skipping a key that is absent, `*`, or unmapped. */
function lookUpLabels(section: LabelSection, keys: ReadonlyArray<string | undefined>): string[] {
  return keys.flatMap((key) => {
    const trimmed = key?.trim();
    const label =
      trimmed === undefined || trimmed === '*' || !Object.hasOwn(section, trimmed) ? undefined : section[trimmed];
    return label === undefined ? [] : [label];
  });
}

// endregion | Helpers
