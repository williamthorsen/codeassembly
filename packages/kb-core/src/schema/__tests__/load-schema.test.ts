import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { KbRoot } from '../../types.js';
import { defaultSchema } from '../default-schema.js';
import { extendOptional, extendRequired, loadSchema, narrowTypes } from '../load-schema.js';

const FIXTURES_DIR = join(import.meta.dirname, 'fixtures');

function kbRootAt(fixture: string): KbRoot {
  const path = join(FIXTURES_DIR, fixture);
  return { path, kbDir: join(path, '.kb'), via: 'ancestor-walk' };
}

describe(loadSchema, () => {
  it('returns the default schema verbatim when no .kb/schema.yaml exists', async () => {
    const schema = await loadSchema({ kbRoot: kbRootAt('no-schema') });

    expect(schema).toBe(defaultSchema);
  });

  it('accepts a per-KB file that narrows the type vocabulary', async () => {
    const schema = await loadSchema({ kbRoot: kbRootAt('narrowed-types') });

    expect(schema.types).toEqual(['howto', 'reference']);
  });

  it('rejects a per-KB file that adds a type not in the default vocabulary', async () => {
    await expect(loadSchema({ kbRoot: kbRootAt('invalid-extends-types') })).rejects.toThrow(/postmortem/);
  });

  it('accepts a per-KB file that adds a required field', async () => {
    const schema = await loadSchema({ kbRoot: kbRootAt('adds-required') });

    expect(schema.required).toContain('owner');
  });

  it('rejects a per-KB file that demotes a default required field', async () => {
    await expect(loadSchema({ kbRoot: kbRootAt('demotes-required') })).rejects.toThrow(/tags.*demoted/);
  });

  it('rejects a per-KB file that lists a field in both required and optional', async () => {
    await expect(loadSchema({ kbRoot: kbRootAt('field-in-both') })).rejects.toThrow(/owner.*both/);
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

describe(narrowTypes, () => {
  it('returns the per-KB types when they are a subset of the defaults', () => {
    expect(narrowTypes(['a', 'b', 'c'], ['a', 'c'])).toEqual(['a', 'c']);
  });

  it('throws naming the rogue type when the per-KB list adds a new type', () => {
    expect(() => narrowTypes(['a', 'b'], ['a', 'z'])).toThrow(/"z"/);
  });
});

describe(extendRequired, () => {
  it('returns the per-KB list when it is a superset of the defaults', () => {
    expect(extendRequired(['a', 'b'], ['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('throws naming the missing field when a default required field is dropped', () => {
    expect(() => extendRequired(['a', 'b'], ['a'])).toThrow(/"b"/);
  });
});

describe(extendOptional, () => {
  it('unions the default and per-KB optional fields', () => {
    expect(extendOptional(['a', 'b'], ['c'], ['title'])).toEqual(['a', 'b', 'c']);
  });

  it('throws naming the field that appears in both required and optional', () => {
    expect(() => extendOptional(['a'], ['title'], ['title'])).toThrow(/title.*both/);
  });
});
