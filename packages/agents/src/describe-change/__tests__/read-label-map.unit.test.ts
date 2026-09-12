import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { type LabelMap, readLabelMap, resolveLabeledHead, resolveLabelKey } from '../read-label-map.ts';

const MAP: LabelMap = {
  scopes: { agents: 'scope:agents', kb: 'scope:kb' },
  types: { drop: 'removal', feat: 'feature', fix: 'fix' },
};

describe(readLabelMap, () => {
  it('reads both sections, dropping an entry whose label is not a string', async () => {
    const labelMapPath = await writeLabelMap({
      scopes: { agents: 'scope:agents', kb: 7 },
      types: { feat: 'feature' },
    });

    expect(await readLabelMap(labelMapPath)).toStrictEqual({
      scopes: { agents: 'scope:agents' },
      types: { feat: 'feature' },
    });
  });

  it('reads a section the map does not declare as empty', async () => {
    const labelMapPath = await writeLabelMap({ types: { feat: 'feature' } });

    expect(await readLabelMap(labelMapPath)).toStrictEqual({ scopes: {}, types: { feat: 'feature' } });
  });

  it('reads an absent map as empty', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'read-label-map-'));

    expect(await readLabelMap(join(dir, 'absent.json'))).toStrictEqual({ scopes: {}, types: {} });
  });

  it('reads a map that is not valid JSON as empty', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'read-label-map-'));
    const labelMapPath = join(dir, 'label-map.json');
    await writeFile(labelMapPath, '{ not json', 'utf8');

    expect(await readLabelMap(labelMapPath)).toStrictEqual({ scopes: {}, types: {} });
  });
});

describe(resolveLabelKey, () => {
  it.each([
    { section: 'types', labels: ['feature', 'scope:agents'], expected: 'feat' },
    { section: 'scopes', labels: ['feature', 'scope:agents'], expected: 'agents' },
  ] as const)('resolves the one $section key that the labels name', ({ section, labels, expected }) => {
    expect(resolveLabelKey(MAP[section], labels)).toBe(expected);
  });

  it.each([
    { section: 'types', labels: ['scope:agents'] },
    { section: 'scopes', labels: ['feature'] },
  ] as const)('yields nothing where the labels name no $section key', ({ section, labels }) => {
    expect(resolveLabelKey(MAP[section], labels)).toBeUndefined();
  });

  it.each([
    { section: 'types', labels: ['feature', 'fix'] },
    { section: 'scopes', labels: ['scope:agents', 'scope:kb'] },
  ] as const)('yields nothing where the labels name two $section keys', ({ section, labels }) => {
    expect(resolveLabelKey(MAP[section], labels)).toBeUndefined();
  });

  it('yields nothing where one label names two keys', () => {
    expect(resolveLabelKey({ drop: 'removal', feat: 'removal' }, ['removal'])).toBeUndefined();
  });

  it('yields nothing for an empty section', () => {
    expect(resolveLabelKey({}, ['feature'])).toBeUndefined();
  });
});

describe(resolveLabeledHead, () => {
  it('resolves the type, the scope, and the breaking label together', () => {
    expect(resolveLabeledHead(MAP, ['removal', 'scope:kb', 'breaking'])).toStrictEqual({
      breaking: true,
      scope: 'kb',
      type: 'drop',
    });
  });

  it('leaves out each dimension that the labels do not resolve', () => {
    expect(resolveLabeledHead(MAP, ['feature', 'fix', 'scope:agents'])).toStrictEqual({ scope: 'agents' });
  });
});

// region | Helpers

/** Writes a label map under a scratch directory and returns its path. */
async function writeLabelMap(content: unknown): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'read-label-map-'));
  const labelMapPath = join(dir, 'label-map.json');
  await writeFile(labelMapPath, JSON.stringify(content), 'utf8');
  return labelMapPath;
}

// endregion | Helpers
