import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveTicketType } from '../resolve-ticket-type.ts';

const TYPES = { deprecate: 'deprecation', drop: 'removal', feat: 'feature', fix: 'fix' };

describe(resolveTicketType, () => {
  it('resolves the one type its label names', async () => {
    const labelMapPath = await writeLabelMap({ types: TYPES });

    expect(await resolveTicketType({ labelMapPath, labels: ['feature', 'scope:agents'] })).toBe('feat');
  });

  it('yields nothing where the labels name no type', async () => {
    const labelMapPath = await writeLabelMap({ types: TYPES });

    expect(await resolveTicketType({ labelMapPath, labels: ['scope:agents', 'priority:high'] })).toBeUndefined();
  });

  it('yields nothing where the labels name two types', async () => {
    const labelMapPath = await writeLabelMap({ types: TYPES });

    expect(await resolveTicketType({ labelMapPath, labels: ['feature', 'fix'] })).toBeUndefined();
  });

  it('yields nothing where one label names two types', async () => {
    const labelMapPath = await writeLabelMap({ types: { drop: 'removal', feat: 'removal' } });

    expect(await resolveTicketType({ labelMapPath, labels: ['removal'] })).toBeUndefined();
  });

  it('yields nothing where no ticket carries a label at all', async () => {
    const labelMapPath = await writeLabelMap({ types: TYPES });

    expect(await resolveTicketType({ labelMapPath, labels: [] })).toBeUndefined();
  });

  it('yields nothing where the repository configures no label map', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'resolve-ticket-type-'));

    expect(await resolveTicketType({ labelMapPath: join(dir, 'absent.json'), labels: ['feature'] })).toBeUndefined();
  });

  it('yields nothing where the label map is not valid JSON', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'resolve-ticket-type-'));
    const labelMapPath = join(dir, 'label-map.json');
    await writeFile(labelMapPath, '{ not json', 'utf8');

    expect(await resolveTicketType({ labelMapPath, labels: ['feature'] })).toBeUndefined();
  });

  it('yields nothing where the label map declares no types section', async () => {
    const labelMapPath = await writeLabelMap({ scopes: { agents: 'scope:agents' } });

    expect(await resolveTicketType({ labelMapPath, labels: ['feature'] })).toBeUndefined();
  });
});

// region | Helpers

/** Writes a label map under a scratch directory and returns its path. */
async function writeLabelMap(content: unknown): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'resolve-ticket-type-'));
  const labelMapPath = join(dir, 'label-map.json');
  await writeFile(labelMapPath, JSON.stringify(content), 'utf8');
  return labelMapPath;
}

// endregion | Helpers
