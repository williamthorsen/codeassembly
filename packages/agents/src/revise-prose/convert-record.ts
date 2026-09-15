/**
 * Conversion of a record written before rules were versioned, whose coverage and rejections are keyed on a unit's
 * version, into the per-rule record.
 *
 * Repositories hold records in that shape at every version their sweeps reached, so the helper converts one whenever
 * it reads one. Only what the run's versions confirm as current
 * carries over: a unit's coverage at the unit's current version stands for each of its versioned rules at the rule's
 * current version, because a rule that changed since that sweep would have raised the unit's version too.
 */
import type { LegacyRecord, ProseRecord, RecordedRejection, RuleCoverage, SweepVersions } from './types.ts';

/**
 * The rule version a converted rejection takes when its unit's recorded version is not current. A declared sweep
 * version is a positive integer, so no current version equals it and the rejection reads as stale.
 */
export const LEGACY_STALE_VERSION = '0';

/**
 * Converts a legacy record into the per-rule record, against the versions that a run holds.
 *
 * A unit entry at its current version becomes one coverage entry per versioned rule of that unit, whose `detected`
 * reports whether the unit's sweeps ran that rule's detector. A unit entry at another version, or under a unit the run
 * does not name, becomes no coverage. A rejection whose unit is current takes its rule's version; one whose unit is not
 * current, or is not named, takes {@link LEGACY_STALE_VERSION}. A rejection under a named unit's rule that has no
 * version is dropped, since the per-rule record keeps nothing for such a rule.
 */
export function convertLegacyRecord(legacy: LegacyRecord, versions: SweepVersions): ProseRecord {
  const rules: Record<string, RuleCoverage> = {};
  for (const [rule, named] of versions.rules) {
    const coverage = legacy.units[named.unit];
    if (coverage === undefined || coverage.version !== versions.units.get(named.unit)) continue;

    rules[rule] = {
      version: named.version,
      'swept-at': coverage['swept-at'],
      detected: coverage.rules.includes(rule),
      roots: coverage.roots,
    };
  }

  const rejections = legacy.rejections.flatMap((rejection): RecordedRejection[] => {
    const { unit, 'unit-version': unitVersion, ...site } = rejection;
    const currentUnitVersion = versions.units.get(unit);
    if (currentUnitVersion === undefined) return [{ ...site, 'rule-version': LEGACY_STALE_VERSION }];

    const named = versions.rules.get(rejection.rule);
    if (named === undefined) return [];

    const isCurrent = unitVersion === currentUnitVersion && named.unit === unit;
    return [{ ...site, 'rule-version': isCurrent ? named.version : LEGACY_STALE_VERSION }];
  });

  return { rules, rejections };
}
