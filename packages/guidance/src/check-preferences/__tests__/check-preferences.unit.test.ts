import { describe, expect, it } from 'vitest';

import { isRecord } from '../../lib/type-guards.ts';
import preferencesSchema from '../../schemas/preferences.v1.json' with { type: 'json' };
import { ANNOTATION_KEYWORDS, checkPreferences, formatFinding, HANDLED_KEYWORDS } from '../check-preferences.ts';
import { findNearestKey } from '../find-nearest-key.ts';

describe(checkPreferences, () => {
  it('accepts a document that omits every optional key', () => {
    expect(checkPreferences({}, preferencesSchema)).toEqual([]);
  });

  it('accepts a declared project stage', () => {
    const document = { project: { maturity: 'hobby', sensitivity: 'low', users: 'owner' } };
    expect(checkPreferences(document, preferencesSchema)).toEqual([]);
  });

  it('reports a known key with an invalid value as an error', () => {
    expect(checkPreferences({ project: { maturity: 'prod' } }, preferencesSchema).map(formatFinding)).toEqual([
      'error project.maturity: must be one of "hobby", "early", "production" (got "prod")',
    ]);
  });

  it('reports a missing required key as an error', () => {
    expect(checkPreferences({ commit: {} }, preferencesSchema).map(formatFinding)).toEqual([
      "error commit: missing required key 'title_format'",
    ]);
  });

  it('reports an unrecognized key as a warning naming the nearest known key', () => {
    const findings = checkPreferences({ projct: {}, project: { maturty: 'hobby' } }, preferencesSchema);
    expect(findings.map(formatFinding)).toEqual([
      "warning projct: unrecognized key; did you mean 'project'?",
      "warning project.maturty: unrecognized key; did you mean 'maturity'?",
    ]);
  });

  it('reports an unrecognized key without a suggestion when no known key is near', () => {
    expect(checkPreferences({ deployment: 'x' }, preferencesSchema).map(formatFinding)).toEqual([
      'warning deployment: unrecognized key',
    ]);
  });

  it('checks values under a schema-valued `additionalProperties` and inside arrays', () => {
    const document = { artifacts: { paths: { chats: 3 } }, editors: [{ name: 'Webstorm', command: 'webstorm' }] };
    expect(checkPreferences(document, preferencesSchema).map(formatFinding)).toEqual([
      'error artifacts.paths.chats: expected string (got 3)',
      "error editors[0]: missing required key 'extensions'",
    ]);
  });

  it('reports a top-level scalar as an error', () => {
    expect(checkPreferences('hobby', preferencesSchema).map(formatFinding)).toEqual([
      'error (root): expected object (got "hobby")',
    ]);
  });

  it('enforces `minimum` and `minLength`', () => {
    const document = { ticket: { title_format: '{title}', pull: { now: '', staleBranchDays: 0 } } };
    expect(checkPreferences(document, preferencesSchema).map(formatFinding)).toEqual([
      'error ticket.pull.now: must be at least 1 characters long',
      'error ticket.pull.staleBranchDays: must be at least 1 (got 0)',
    ]);
  });

  it('handles or annotates every keyword that the preferences schema uses', () => {
    const known = new Set([...HANDLED_KEYWORDS, ...ANNOTATION_KEYWORDS]);
    const unhandled = [...collectKeywords(preferencesSchema).difference(known)];
    expect(unhandled).toEqual([]);
  });
});

describe(findNearestKey, () => {
  it('returns the known key within the edit-distance threshold, ignoring case', () => {
    expect(findNearestKey('Maturty', ['maturity', 'slug'])).toBe('maturity');
  });

  it('breaks a tie in favor of the alphabetically first key', () => {
    expect(findNearestKey('pr', ['ps', 'pa'])).toBe('pa');
  });

  it('returns undefined when every known key is beyond the threshold', () => {
    expect(findNearestKey('deployment', ['project', 'repository'])).toBeUndefined();
  });
});

// region | Helpers

/**
 * Collects the keywords used by a schema node and its subschemas. Keys under `properties` are property names, so the
 * walk descends into their values rather than collecting them.
 */
function collectKeywords(schema: unknown): Set<string> {
  const keywords = new Set<string>();
  if (!isRecord(schema)) {
    return keywords;
  }
  for (const [keyword, value] of Object.entries(schema)) {
    keywords.add(keyword);
    const subschemas =
      keyword === 'properties' && isRecord(value)
        ? Object.values(value)
        : keyword === 'items' || keyword === 'additionalProperties'
          ? [value]
          : [];
    for (const subschema of subschemas) {
      for (const nested of collectKeywords(subschema)) {
        keywords.add(nested);
      }
    }
  }
  return keywords;
}

// endregion | Helpers
