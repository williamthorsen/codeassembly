import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { kbRootAt as kbRootForPath } from '../../test-utils/scaffolding.ts';
import type { KbRoot } from '../../types.ts';
import { defaultSchema } from '../default-schema.ts';
import { loadSchema, resolveRequiredForRecordType } from '../load-schema.ts';

const FIXTURES_DIR = join(import.meta.dirname, 'fixtures');

function kbRootAt(fixture: string): KbRoot {
  return kbRootForPath(join(FIXTURES_DIR, fixture));
}

describe(loadSchema, () => {
  it('returns the default schema verbatim when no .kb/schema.yaml exists', async () => {
    const schema = await loadSchema({ kbRoot: kbRootAt('no-schema') });

    expect(schema).toBe(defaultSchema);
  });

  it('returns the declared record types from a recordTypes: file', async () => {
    const schema = await loadSchema({ kbRoot: kbRootAt('record-types') });

    expect(Object.keys(schema.recordTypes)).toEqual(['event', 'assertion']);
    expect(schema.recordTypes.event?.recall).toBe('recurrence-recency');
    expect(schema.recordTypes.assertion?.recall).toBe('freshness');
  });

  it('ignores a retired immutable key, loading the record type without it', async () => {
    const schema = await loadSchema({ kbRoot: kbRootAt('record-types') });

    // The `record-types` fixture still declares `immutable: true`; the loader strips the unknown key rather than
    // rejecting it, so a store carrying the retired flag keeps loading.
    const event = schema.recordTypes.event;
    expect(event).toBeDefined();
    expect(event !== undefined && 'immutable' in event).toBe(false);
    expect(event?.required).not.toContain('updated');
  });

  it('rejects a file that still uses the retired kinds: shape, naming the source path', async () => {
    await expect(loadSchema({ kbRoot: kbRootAt('rejects-kinds') })).rejects.toThrow(
      /rejects-kinds.*schema\.yaml: invalid schema\.yaml —/s,
    );
  });

  it('rejects a file that still uses the retired flat types: shape, naming the source path', async () => {
    await expect(loadSchema({ kbRoot: kbRootAt('rejects-types') })).rejects.toThrow(
      /rejects-types.*schema\.yaml: invalid schema\.yaml —/s,
    );
  });

  it('rejects a .kb/schema.yaml with malformed YAML, naming the source path', async () => {
    await expect(loadSchema({ kbRoot: kbRootAt('malformed-yaml') })).rejects.toThrow(
      /malformed-yaml.*schema\.yaml: malformed YAML —/s,
    );
  });

  it('rejects a structurally invalid .kb/schema.yaml, naming the source path', async () => {
    await expect(loadSchema({ kbRoot: kbRootAt('invalid-structure') })).rejects.toThrow(
      /invalid-structure.*schema\.yaml: invalid schema\.yaml —/s,
    );
  });
});

describe(resolveRequiredForRecordType, () => {
  it('returns the record type required set verbatim', async () => {
    const schema = await loadSchema({ kbRoot: kbRootAt('record-types') });

    expect(resolveRequiredForRecordType(schema, 'event')).toEqual(['id', 'captured-at', 'session', 'cwd', 'summary']);
  });

  it('returns the assertion required set for the assertion record type', async () => {
    const schema = await loadSchema({ kbRoot: kbRootAt('record-types') });

    expect(resolveRequiredForRecordType(schema, 'assertion')).toEqual(['title', 'created', 'updated', 'tags']);
  });

  it('returns undefined for a record type not declared by the schema', async () => {
    const schema = await loadSchema({ kbRoot: kbRootAt('record-types') });

    expect(resolveRequiredForRecordType(schema, 'nonexistent')).toBeUndefined();
  });
});
