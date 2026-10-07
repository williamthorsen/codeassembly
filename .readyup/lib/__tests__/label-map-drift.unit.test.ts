import { describe, expect, it } from 'vitest';

import {
  deriveExpectedScopeKeys,
  describeScopeDrift,
  diffScopeKeys,
  isReleaseKitSchemaUrl,
  isSchemaVersionBehind,
  parseChangeGrammarVersion,
} from '../label-map-drift.ts';

const CHANGE_GRAMMAR_SCHEMA_URL =
  'https://github.com/williamthorsen/node-monorepo-tools/raw/change-grammar-v0.1.0/packages/change-grammar/schemas/label-map.json';
const RELEASE_KIT_SCHEMA_URL =
  'https://github.com/williamthorsen/node-monorepo-tools/raw/release-kit-v8.0.1/packages/release-kit/schemas/label-map.json';

describe(deriveExpectedScopeKeys, () => {
  it('appends the synthetic root scope when packages exist', () => {
    expect(deriveExpectedScopeKeys(['agents', 'fleet'])).toEqual(['agents', 'fleet', 'root']);
  });

  it('returns an empty set when the package list is empty', () => {
    expect(deriveExpectedScopeKeys([])).toEqual([]);
  });

  it('sorts the derived keys', () => {
    expect(deriveExpectedScopeKeys(['fleet', 'agents'])).toEqual(['agents', 'fleet', 'root']);
  });
});

describe(diffScopeKeys, () => {
  it('reports an empty diff when the sets match', () => {
    expect(diffScopeKeys(['agents', 'root'], ['agents', 'root'])).toEqual({ missing: [], extra: [] });
  });

  it('reports a scope missing from the actual set', () => {
    expect(diffScopeKeys(['agents', 'foreman', 'root'], ['agents', 'root'])).toEqual({
      missing: ['foreman'],
      extra: [],
    });
  });

  it('reports a scope left over in the actual set', () => {
    expect(diffScopeKeys(['agents', 'root'], ['agents', 'stale', 'root'])).toEqual({
      missing: [],
      extra: ['stale'],
    });
  });

  it('reports missing and extra together', () => {
    expect(diffScopeKeys(['agents', 'foreman'], ['agents', 'stale'])).toEqual({
      missing: ['foreman'],
      extra: ['stale'],
    });
  });
});

describe(describeScopeDrift, () => {
  it('names the missing scope(s)', () => {
    expect(describeScopeDrift({ missing: ['foreman'], extra: [] })).toBe('missing: foreman');
  });

  it('names the extra scope(s)', () => {
    expect(describeScopeDrift({ missing: [], extra: ['stale'] })).toBe('extra: stale');
  });

  it('joins missing and extra clauses', () => {
    expect(describeScopeDrift({ missing: ['foreman', 'kb'], extra: ['stale'] })).toBe(
      'missing: foreman, kb; extra: stale',
    );
  });
});

describe(isSchemaVersionBehind, () => {
  it('is behind when the pinned version is older', () => {
    expect(isSchemaVersionBehind('5.2.0', '8.0.1')).toBe(true);
  });

  it('is not behind when the versions are equal', () => {
    expect(isSchemaVersionBehind('8.0.1', '8.0.1')).toBe(false);
  });

  it('is not behind when the pinned version is newer', () => {
    expect(isSchemaVersionBehind('9.0.0', '8.0.1')).toBe(false);
  });
});

describe(isReleaseKitSchemaUrl, () => {
  it('recognizes the former release-kit schema location', () => {
    expect(isReleaseKitSchemaUrl(RELEASE_KIT_SCHEMA_URL)).toBe(true);
  });

  it('does not match the change-grammar schema location', () => {
    expect(isReleaseKitSchemaUrl(CHANGE_GRAMMAR_SCHEMA_URL)).toBe(false);
  });
});

describe(parseChangeGrammarVersion, () => {
  it('extracts the pinned version from a $schema URL', () => {
    expect(parseChangeGrammarVersion(CHANGE_GRAMMAR_SCHEMA_URL)).toBe('0.1.0');
  });

  it('returns undefined when the URL pins a release-kit version', () => {
    expect(parseChangeGrammarVersion(RELEASE_KIT_SCHEMA_URL)).toBeUndefined();
  });

  it('returns undefined when the URL does not pin a version', () => {
    expect(parseChangeGrammarVersion('https://example.com/schema.json')).toBeUndefined();
  });
});
