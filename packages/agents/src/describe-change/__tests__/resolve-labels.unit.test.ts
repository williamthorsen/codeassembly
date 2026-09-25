import { describe, expect, it } from 'vitest';

import type { ChangeEntry } from '../change-entries.ts';
import type { LabelMap } from '../read-label-map.ts';
import { resolveLabels } from '../resolve-labels.ts';

const MAP: LabelMap = {
  scopes: { agents: 'scope:agents', kb: 'scope:kb', root: 'scope:root' },
  types: { docs: 'documentation', feat: 'feature', fix: 'fix' },
};

describe(resolveLabels, () => {
  it('labels every type and workspace scope that the entries name, and breaking when any entry is breaking', () => {
    const entries = [
      buildEntry({ scopes: ['agents'], type: 'feat' }),
      buildEntry({ breaking: true, scopes: ['kb', 'agents'], type: 'fix' }),
      buildEntry({ scopes: ['root'], type: 'docs' }),
    ];

    expect(resolveLabels({ entries, labelMap: MAP, record: {} })).toStrictEqual([
      'feature',
      'fix',
      'documentation',
      'breaking',
      'scope:agents',
      'scope:kb',
    ]);
  });

  it('sets root aside when the entries also name one workspace', () => {
    const entries = [buildEntry({ scopes: ['agents'], type: 'feat' }), buildEntry({ scopes: ['root'], type: 'docs' })];

    expect(resolveLabels({ entries, labelMap: MAP, record: {} })).toStrictEqual([
      'feature',
      'documentation',
      'scope:agents',
    ]);
  });

  it('labels a process-tier entry’s workspace beside a higher-tier entry’s workspace', () => {
    const entries = [buildEntry({ scopes: ['agents'], type: 'feat' }), buildEntry({ scopes: ['kb'], type: 'docs' })];

    expect(resolveLabels({ entries, labelMap: MAP, record: {} })).toStrictEqual([
      'feature',
      'documentation',
      'scope:agents',
      'scope:kb',
    ]);
  });

  it('labels root when the entries name root alone, or root beside a wildcard', () => {
    const entries = [
      buildEntry({ scopes: ['root'], type: 'fix' }),
      buildEntry({ scopes: ['*', 'root'], type: 'docs' }),
    ];

    expect(resolveLabels({ entries, labelMap: MAP, record: {} })).toStrictEqual(['fix', 'documentation', 'scope:root']);
  });

  it('leads each group with the record’s label and lists every label once', () => {
    const entries = [buildEntry({ scopes: ['agents'], type: 'feat' }), buildEntry({ scopes: ['kb'], type: 'fix' })];

    expect(resolveLabels({ entries, labelMap: MAP, record: { scope: 'kb', type: 'fix' } })).toStrictEqual([
      'fix',
      'feature',
      'scope:kb',
      'scope:agents',
    ]);
  });

  it('labels the record alone when the change has no entries', () => {
    expect(
      resolveLabels({ entries: [], labelMap: MAP, record: { breaking: true, scope: 'agents', type: 'feat' } }),
    ).toStrictEqual(['feature', 'breaking', 'scope:agents']);
  });

  it('adds the label of a record type that no entry names, as an override sets it', () => {
    const entries = [buildEntry({ scopes: ['agents'], type: 'feat' })];

    expect(resolveLabels({ entries, labelMap: MAP, record: { type: 'docs' } })).toStrictEqual([
      'documentation',
      'feature',
      'scope:agents',
    ]);
  });

  it('skips a type or scope that the map does not name, and a scope of *', () => {
    const entries = [buildEntry({ scopes: ['fleet', '*'], type: 'perf' })];

    expect(resolveLabels({ entries, labelMap: MAP, record: { scope: '*', type: 'constructor' } })).toStrictEqual([]);
  });

  it('yields no label, breaking included, when the map configures none', () => {
    const entries = [buildEntry({ breaking: true, scopes: ['agents'], type: 'feat' })];

    expect(resolveLabels({ entries, labelMap: { scopes: {}, types: {} }, record: { breaking: true } })).toStrictEqual(
      [],
    );
  });
});

// region | Helpers

/** Builds an entry with the given fields, defaulting the rest. */
function buildEntry(fields: Partial<ChangeEntry> & Pick<ChangeEntry, 'type'>): ChangeEntry {
  return { breaking: false, scopes: [], text: 'Changes something', ...fields };
}

// endregion | Helpers
