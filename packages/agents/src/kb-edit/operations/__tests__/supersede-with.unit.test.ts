import type { AliasMap } from '@williamthorsen/kb';
import type { KbAssertion } from '@williamthorsen/kb/records';
import { describe, expect, it } from 'vitest';

import { prepareSupersedeWith } from '../supersede-with.ts';

const NOW = new Date('2026-05-24T14:35:00Z');
const KB_PATH = '/tmp/vault';

/** Builds a baseline assertion record for the operation under test, with overrides merged in. */
function buildAssertion(overrides: Partial<KbAssertion> = {}): KbAssertion {
  return {
    recordType: 'assertion',
    title: 'Example',
    created: '2026-05-01T08:17:23Z',
    updated: '2026-05-01T08:17:23Z',
    tags: ['example'],
    addressedBy: [],
    extra: {},
    body: '\nBody.\n',
    ...overrides,
  };
}

const NO_ALIASES: AliasMap = new Map();

describe(prepareSupersedeWith, () => {
  it('writes superseded-by on old, supersedes on new, and adds deprecated to old', () => {
    const result = prepareSupersedeWith({
      oldRecord: buildAssertion(),
      oldPath: `${KB_PATH}/old.md`,
      newRecord: buildAssertion(),
      newPath: `${KB_PATH}/new.md`,
      kbPath: KB_PATH,
      aliases: NO_ALIASES,
      now: NOW,
    });

    expect(result.old.supersededBy).toBe('new.md');
    expect(result.new.supersedes).toBe('old.md');
    expect(result.old.tags).toContain('deprecated');
  });

  it('bumps updated on both notes', () => {
    const result = prepareSupersedeWith({
      oldRecord: buildAssertion(),
      oldPath: `${KB_PATH}/old.md`,
      newRecord: buildAssertion(),
      newPath: `${KB_PATH}/new.md`,
      kbPath: KB_PATH,
      aliases: NO_ALIASES,
      now: NOW,
    });

    expect(result.old.updated).toBe('2026-05-24T14:35:00Z');
    expect(result.new.updated).toBe('2026-05-24T14:35:00Z');
  });

  it('writes KB-relative pointers when notes are in subfolders', () => {
    const result = prepareSupersedeWith({
      oldRecord: buildAssertion(),
      oldPath: `${KB_PATH}/legacy/old.md`,
      newRecord: buildAssertion(),
      newPath: `${KB_PATH}/current/new.md`,
      kbPath: KB_PATH,
      aliases: NO_ALIASES,
      now: NOW,
    });

    expect(result.old.supersededBy).toBe('current/new.md');
    expect(result.new.supersedes).toBe('legacy/old.md');
  });

  it('is idempotent when deprecated tag is already present', () => {
    const result = prepareSupersedeWith({
      oldRecord: buildAssertion({ tags: ['legacy', 'deprecated'] }),
      oldPath: `${KB_PATH}/old.md`,
      newRecord: buildAssertion(),
      newPath: `${KB_PATH}/new.md`,
      kbPath: KB_PATH,
      aliases: NO_ALIASES,
      now: NOW,
    });

    expect(result.old.tags.filter((t) => t === 'deprecated')).toHaveLength(1);
    expect(result.old.tags).toEqual(['legacy', 'deprecated']);
  });

  it('canonicalizes deprecated through the alias map before adding it', () => {
    const aliases: AliasMap = new Map([['deprecated', 'archived']]);
    const result = prepareSupersedeWith({
      oldRecord: buildAssertion({ tags: ['legacy'] }),
      oldPath: `${KB_PATH}/old.md`,
      newRecord: buildAssertion(),
      newPath: `${KB_PATH}/new.md`,
      kbPath: KB_PATH,
      aliases,
      now: NOW,
    });

    expect(result.old.tags).toEqual(['legacy', 'archived']);
  });

  it('preserves other fields on both notes', () => {
    const result = prepareSupersedeWith({
      oldRecord: buildAssertion({ extra: { 'applies-to': 'node 22' } }),
      oldPath: `${KB_PATH}/old.md`,
      newRecord: buildAssertion({ lastVerified: '2026-04-15T13:28:14Z' }),
      newPath: `${KB_PATH}/new.md`,
      kbPath: KB_PATH,
      aliases: NO_ALIASES,
      now: NOW,
    });

    expect(result.old.extra['applies-to']).toBe('node 22');
    expect(result.new.lastVerified).toBe('2026-04-15T13:28:14Z');
  });
});
