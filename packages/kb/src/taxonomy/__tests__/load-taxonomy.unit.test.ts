import { describe, expect, it } from 'vitest';

import { isKbLoaderError, KbLoaderError } from '../../config/kb-loader-error.ts';
import { makeKbRoot } from '../../test-utils/kb-root.ts';
import { loadTaxonomy } from '../load-taxonomy.ts';

describe(loadTaxonomy, () => {
  it('returns an empty taxonomy when no taxonomy.yaml exists', async () => {
    const kbRoot = await makeKbRoot();

    expect(await loadTaxonomy({ kbRoot })).toEqual(new Map());
  });

  it('returns an empty taxonomy for a file that declares nothing', async () => {
    const kbRoot = await makeKbRoot({ taxonomy: '# a commented-out stub declares no domains\n' });

    expect(await loadTaxonomy({ kbRoot })).toEqual(new Map());
  });

  it('loads both blocks into one map, marking which block each entry came from', async () => {
    const kbRoot = await makeKbRoot({
      taxonomy: 'domains:\n  engineering: Software engineering practice\nprovisional:\n  tools/vim: Vim\n',
    });

    expect(await loadTaxonomy({ kbRoot })).toEqual(
      new Map([
        ['engineering', { description: 'Software engineering practice', provisional: false }],
        ['tools/vim', { description: 'Vim', provisional: true }],
      ]),
    );
  });

  it('loads a domain declared at any depth', async () => {
    const kbRoot = await makeKbRoot({ taxonomy: 'domains:\n  engineering/tooling/versioning: Releases\n' });

    const taxonomy = await loadTaxonomy({ kbRoot });

    expect(taxonomy.get('engineering/tooling/versioning')).toEqual({ description: 'Releases', provisional: false });
  });

  it('reads a bare key as a domain declared without a description', async () => {
    const kbRoot = await makeKbRoot({ taxonomy: 'provisional:\n  engineering:\n' });

    const taxonomy = await loadTaxonomy({ kbRoot });

    expect(taxonomy.get('engineering')).toEqual({ description: '', provisional: true });
  });

  it('reads a block header with nothing under it as declaring nothing', async () => {
    const kbRoot = await makeKbRoot({ taxonomy: 'domains:\n  engineering: Practice\nprovisional:\n' });

    expect(await loadTaxonomy({ kbRoot })).toEqual(
      new Map([['engineering', { description: 'Practice', provisional: false }]]),
    );
  });

  it('returns an empty taxonomy when both block headers have nothing under them', async () => {
    const kbRoot = await makeKbRoot({ taxonomy: 'domains:\nprovisional:\n' });

    expect(await loadTaxonomy({ kbRoot })).toEqual(new Map());
  });

  it('names the offending key when a block is the wrong type', async () => {
    const kbRoot = await makeKbRoot({ taxonomy: 'domains: not-a-mapping\n' });

    await expect(loadTaxonomy({ kbRoot })).rejects.toThrow(/at domains/);
  });

  it('loads a file declaring only one of the two blocks', async () => {
    const kbRoot = await makeKbRoot({ taxonomy: 'provisional:\n  tools: Tooling\n' });

    expect(await loadTaxonomy({ kbRoot })).toEqual(new Map([['tools', { description: 'Tooling', provisional: true }]]));
  });

  it('throws a KbLoaderError naming the file when the YAML is malformed', async () => {
    const kbRoot = await makeKbRoot({ taxonomy: 'domains: [unterminated\n' });

    await expect(loadTaxonomy({ kbRoot })).rejects.toBeInstanceOf(KbLoaderError);
    await expect(loadTaxonomy({ kbRoot })).rejects.toThrow(/taxonomy\.yaml/);
  });

  it('attaches the YAML parse failure as the cause', async () => {
    const kbRoot = await makeKbRoot({ taxonomy: 'domains: [unterminated\n' });

    await expect(loadTaxonomy({ kbRoot })).rejects.toHaveProperty('cause', expect.any(Error));
  });

  it('throws a KbLoaderError when a description is not a string', async () => {
    const kbRoot = await makeKbRoot({ taxonomy: 'domains:\n  engineering: 42\n' });

    await expect(loadTaxonomy({ kbRoot })).rejects.toBeInstanceOf(KbLoaderError);
  });

  it('throws a KbLoaderError when the top level is not a mapping', async () => {
    const kbRoot = await makeKbRoot({ taxonomy: '- engineering\n' });

    await expect(loadTaxonomy({ kbRoot })).rejects.toBeInstanceOf(KbLoaderError);
  });

  it('throws a KbLoaderError naming the path declared in both blocks', async () => {
    const kbRoot = await makeKbRoot({ taxonomy: 'domains:\n  engineering: Practice\nprovisional:\n  engineering:\n' });

    await expect(loadTaxonomy({ kbRoot })).rejects.toThrow(/"engineering" is declared in both/);
  });

  it.each([
    ['""', 'is empty'],
    ['"/engineering"', 'leading or trailing slash'],
    ['"engineering/"', 'leading or trailing slash'],
    ['"engineering//tooling"', 'empty segment'],
    ['"engineering/./tooling"', '"." or ".." segment'],
    ['"engineering/../tooling"', '"." or ".." segment'],
    ['"assertions/engineering"', 'restates'],
    ['"content/assertions/engineering"', 'restates'],
    [String.raw`"engineering\\tooling"`, 'backslash'],
  ])('rejects the malformed key %s', async (key, reason) => {
    const kbRoot = await makeKbRoot({ taxonomy: `domains:\n  ${key}: Practice\n` });

    let thrown: unknown;
    try {
      await loadTaxonomy({ kbRoot });
    } catch (error) {
      thrown = error;
    }

    expect(isKbLoaderError(thrown)).toBe(true);
    expect(String(thrown)).toContain(reason);
  });

  it('rejects a malformed key in the provisional block too', async () => {
    const kbRoot = await makeKbRoot({ taxonomy: 'provisional:\n  "assertions/engineering":\n' });

    await expect(loadTaxonomy({ kbRoot })).rejects.toBeInstanceOf(KbLoaderError);
  });
});
