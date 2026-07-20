import { describe, expect, it } from 'vitest';

import {
  deriveExpectedScopeKeys,
  describeScopeDrift,
  diffScopeKeys,
  isSchemaVersionBehind,
  parseReleaseKitVersion,
} from '../label-map-drift.ts';

describe(deriveExpectedScopeKeys, () => {
  it('appends the synthetic root scope when packages exist', () => {
    expect(deriveExpectedScopeKeys(['agents', 'fleet'])).toEqual(['agents', 'fleet', 'root']);
  });

  it('returns an empty set when no packages exist', () => {
    expect(deriveExpectedScopeKeys([])).toEqual([]);
  });

  it('sorts the derived keys', () => {
    expect(deriveExpectedScopeKeys(['fleet', 'agents'])).toEqual(['agents', 'fleet', 'root']);
  });
});

describe(diffScopeKeys, () => {
  it('reports no drift when the sets match', () => {
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

describe(parseReleaseKitVersion, () => {
  it('extracts the pinned version from a $schema URL', () => {
    const url =
      'https://github.com/williamthorsen/node-monorepo-tools/raw/release-kit-v8.0.1/packages/release-kit/schemas/label-map.json';
    expect(parseReleaseKitVersion(url)).toBe('8.0.1');
  });

  it('returns undefined when the URL pins no release-kit version', () => {
    expect(parseReleaseKitVersion('https://example.com/schema.json')).toBeUndefined();
  });
});
