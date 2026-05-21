import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadAliases, parseAliases } from '../load-aliases.js';

const FIXTURES_DIR = join(import.meta.dirname, 'fixtures');

async function readFixture(name: string): Promise<string> {
  return readFile(join(FIXTURES_DIR, name), 'utf8');
}

describe(parseAliases, () => {
  it('loads a valid registry into an alias-to-canonical map', async () => {
    const map = await readFixture('valid-aliases.yaml').then((text) => parseAliases(text, 'valid'));

    expect(map.get('git-sparse-checkout')).toBe('git');
    expect(map.get('vcs')).toBe('git');
    expect(map.get('node.js')).toBe('nodejs');
    expect(map.get('tl')).toBe('testing-library');
  });

  it('lowercases alias keys on insertion', () => {
    const map = parseAliases('aliases:\n  git: [VCS, Version-Control]\n');

    expect(map.get('vcs')).toBe('git');
    expect(map.get('version-control')).toBe('git');
  });

  it('throws naming the offending alias and source when an alias collides across canonicals', async () => {
    const text = await readFixture('collision.yaml');

    expect(() => parseAliases(text, 'collision.yaml')).toThrow(/collision\.yaml.*vcs.*git.*mercurial/);
  });

  it('throws naming the offending alias and source when an alias equals its canonical', async () => {
    const text = await readFixture('self-alias.yaml');

    expect(() => parseAliases(text, 'self-alias.yaml')).toThrow(/self-alias\.yaml.*git.*equals/);
  });

  it('throws naming the canonical and source when an alias list contains non-string entries', () => {
    expect(() => parseAliases('aliases:\n  git: [vcs, 42]\n', 'mixed.yaml')).toThrow(/mixed\.yaml.*git.*string/);
  });

  it('throws naming the canonical and source when an alias value is not a list', async () => {
    const text = await readFixture('malformed.yaml');

    expect(() => parseAliases(text, 'malformed.yaml')).toThrow(/malformed\.yaml.*git.*list/);
  });

  it('throws naming the source when the "aliases" key is missing', () => {
    expect(() => parseAliases('other: value\n', 'no-aliases.yaml')).toThrow(/no-aliases\.yaml.*aliases/);
  });

  it('throws naming the source when the top level is not a mapping', () => {
    expect(() => parseAliases('- just\n- a\n- list\n', 'list.yaml')).toThrow(/list\.yaml.*mapping/);
  });
});

describe(loadAliases, () => {
  function kbRootAt(path: string) {
    return { path, kbDir: join(path, '.kb'), via: 'ancestor-walk' as const };
  }

  it('reads .kb/tag-aliases.yaml from a KB root into an AliasMap', async () => {
    const map = await loadAliases({ kbRoot: kbRootAt(join(FIXTURES_DIR, 'kb-root')) });

    expect(map.get('vcs')).toBe('git');
    expect(map.get('reactjs')).toBe('react');
  });

  it('rejects when the KB root has no tag-aliases file', async () => {
    await expect(loadAliases({ kbRoot: kbRootAt('/no/such/kb') })).rejects.toThrow();
  });
});
