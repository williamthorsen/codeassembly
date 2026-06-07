import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { kbRootAt as kbRootForPath } from '../../test-utils/index.ts';
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

  it('marks an immutable record type that omits updated from its required set', async () => {
    const schema = await loadSchema({ kbRoot: kbRootAt('record-types') });

    expect(schema.recordTypes.event?.immutable).toBe(true);
    expect(schema.recordTypes.event?.required).not.toContain('updated');
  });

  it('defaults immutable to false for a record type that omits it', async () => {
    const schema = await loadSchema({ kbRoot: kbRootAt('record-types') });

    expect(schema.recordTypes.assertion?.immutable).toBe(false);
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
