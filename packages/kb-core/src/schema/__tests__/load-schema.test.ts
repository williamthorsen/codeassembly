import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { KbRoot } from '../../types.ts';
import { defaultSchema } from '../default-schema.ts';
import { extendOptional, extendRequired, loadSchema, narrowTypes, resolveRequiredForType } from '../load-schema.ts';

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

  it('exposes the declared kinds when the file opts into kind-aware mode', async () => {
    const schema = await loadSchema({ kbRoot: kbRootAt('kind-aware') });

    expect(Object.keys(schema.kinds ?? {})).toEqual(['event', 'assertion']);
    expect(schema.kinds?.event?.recall).toBe('recurrence-recency');
    expect(schema.kinds?.assertion?.recall).toBe('freshness');
  });

  it('marks an immutable kind that omits updated from its required set', async () => {
    const schema = await loadSchema({ kbRoot: kbRootAt('kind-aware') });

    expect(schema.kinds?.event?.immutable).toBe(true);
    expect(schema.kinds?.event?.required).not.toContain('updated');
  });

  it('derives the flat types union from every kind and type', async () => {
    const schema = await loadSchema({ kbRoot: kbRootAt('kind-aware') });

    expect([...schema.types].toSorted()).toEqual(
      ['concept', 'howto', 'mistake', 'observation', 'reference', 'tutorial'].toSorted(),
    );
  });

  it('derives the flat required union from every kind spine and type addition', async () => {
    const schema = await loadSchema({ kbRoot: kbRootAt('kind-aware') });

    expect(schema.required).toContain('correction');
    expect(schema.required).toContain('captured-at');
    expect(schema.required).toContain('title');
  });

  it('replaces rather than extends the default vocabulary in kind-aware mode', async () => {
    const schema = await loadSchema({ kbRoot: kbRootAt('kind-aware') });

    // `created`/`updated` belong only to the assertion kind, so they are not required for event-kind types.
    expect(schema.kinds?.event?.required).not.toContain('created');
  });
});

describe(resolveRequiredForType, () => {
  it('returns undefined for a legacy schema with no kinds', () => {
    expect(resolveRequiredForType(defaultSchema, 'howto')).toBeUndefined();
  });

  it('unions the kind spine with the type additions for a kind-aware type', async () => {
    const schema = await loadSchema({ kbRoot: kbRootAt('kind-aware') });

    expect(resolveRequiredForType(schema, 'mistake')).toEqual([
      'id',
      'type',
      'captured-at',
      'session',
      'cwd',
      'repo',
      'summary',
      'correction',
    ]);
  });

  it('returns only the kind spine for a type that adds nothing', async () => {
    const schema = await loadSchema({ kbRoot: kbRootAt('kind-aware') });

    expect(resolveRequiredForType(schema, 'observation')).toEqual([
      'id',
      'type',
      'captured-at',
      'session',
      'cwd',
      'repo',
      'summary',
    ]);
  });

  it('returns undefined for a type not declared by any kind', async () => {
    const schema = await loadSchema({ kbRoot: kbRootAt('kind-aware') });

    expect(resolveRequiredForType(schema, 'nonexistent')).toBeUndefined();
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
