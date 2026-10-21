import type { ArtifactType } from '../../lib/artifact-types.ts';
import type { ResolutionEntry } from './sync-plan.ts';

/** Rank used to group resolution entries by type before the within-type slug sort. */
const ARTIFACT_TYPE_ORDER: Readonly<Record<ArtifactType, number>> = {
  rulebook: 0,
  skill: 1,
  subagent: 2,
  collection: 3,
};

/**
 * Renders the per-artifact resolution report, sorted by type then slug: each deployed artifact and the source from
 * which it resolved (`← source "<name>"`), with `(shadows source "<name>")` appended on a shadow. Type and slug
 * columns are padded for scannability. Pure and deterministic for a given entry set.
 */
export function renderResolutionReport(entries: ReadonlyArray<ResolutionEntry>): string {
  const sorted = entries.toSorted(compareResolutionEntries);
  const typeWidth = Math.max(...sorted.map((entry) => entry.type.length));
  const slugWidth = Math.max(...sorted.map((entry) => entry.slug.length));
  const lines = sorted.map((entry) => {
    const shadow = entry.shadowedSources.length > 0 ? ` (shadows ${describeSourceNames(entry.shadowedSources)})` : '';
    return `  ${entry.type.padEnd(typeWidth)}  ${entry.slug.padEnd(slugWidth)}  ← source "${entry.source}"${shadow}`;
  });
  return ['[dry-run] sync would resolve:', ...lines].join('\n');
}

/** Renders the real-run warning naming each deployed artifact that shadows a lower-precedence source's artifact. */
export function renderShadowWarning(shadows: ReadonlyArray<ResolutionEntry>): string {
  const details = shadows
    .toSorted(compareResolutionEntries)
    .map(
      (entry) =>
        `${entry.type} "${entry.slug}" (source "${entry.source}" over ${describeSourceNames(entry.shadowedSources)})`,
    )
    .join(', ');
  const plural = shadows.length === 1 ? '' : 's';
  const verb = shadows.length === 1 ? 's' : '';
  return `${shadows.length} artifact${plural} shadow${verb} a lower-precedence source: ${details}`;
}

// region | Helpers

/** Orders resolution entries by artifact type, then by slug, so the report is deterministic. */
function compareResolutionEntries(a: ResolutionEntry, b: ResolutionEntry): number {
  if (a.type !== b.type) {
    return ARTIFACT_TYPE_ORDER[a.type] - ARTIFACT_TYPE_ORDER[b.type];
  }
  return a.slug.localeCompare(b.slug);
}

/** Renders source names for a report line: `source "a"` or `sources "a", "b"`. */
function describeSourceNames(names: ReadonlyArray<string>): string {
  return `source${names.length === 1 ? '' : 's'} ${names.map((name) => `"${name}"`).join(', ')}`;
}

// endregion | Helpers
