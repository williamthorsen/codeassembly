import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildKbStandardTagsPartial, checkKbStandardTagsPartial } from '../build-kb-standard-tags-partial.ts';

describe(buildKbStandardTagsPartial, () => {
  it('renders one bullet per tag, in the order given, under a level-two heading', () => {
    const partial = buildKbStandardTagsPartial([
      { tag: 'alpha', meaning: 'First.' },
      { tag: 'beta', meaning: 'Second.' },
    ]);

    expect(partial.startsWith('## Standard tags\n')).toBe(true);
    expect(partial.split('\n').filter((line) => line.startsWith('- '))).toStrictEqual([
      '- `alpha`: First.',
      '- `beta`: Second.',
    ]);
    expect(partial.endsWith('\n')).toBe(true);
  });
});

describe(checkKbStandardTagsPartial, () => {
  let scratch: string;
  let filePath: string;

  beforeEach(async () => {
    scratch = await mkdtemp(path.join(tmpdir(), 'kb-standard-tags-'));
    filePath = path.join(scratch, 'kb-standard-tags.md');
  });

  afterEach(async () => {
    await rm(scratch, { force: true, recursive: true });
  });

  it('reports a file that matches the rendered partial as current', async () => {
    await writeFile(filePath, buildKbStandardTagsPartial(), 'utf8');

    expect(await checkKbStandardTagsPartial(filePath)).toBe('current');
  });

  it('reports a file that differs as stale', async () => {
    await writeFile(filePath, '## Standard tags\n', 'utf8');

    expect(await checkKbStandardTagsPartial(filePath)).toBe('stale');
  });

  it('reports an absent file as missing', async () => {
    expect(await checkKbStandardTagsPartial(filePath)).toBe('missing');
  });
});
