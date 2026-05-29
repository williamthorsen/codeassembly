import type { VaultIndex } from '@codeassembly/kb-core';
import { describe, expect, it } from 'vitest';

import { rewriteWikilinks } from '../apply/rewrite-wikilinks.ts';

function indexOf(entries: Array<[string, string[]]>): VaultIndex {
  return new Map(entries.map(([key, paths]) => [key, new Set(paths)]));
}

describe(rewriteWikilinks, () => {
  it('rewrites a stale path-qualified link to the canonical vault-relative path', () => {
    const result = rewriteWikilinks({
      body: 'See [[old/Foo]] now.',
      vaultIndex: indexOf([['Foo', ['tools/Foo.md']]]),
    });

    expect(result.changed).toBe(true);
    expect(result.body).toBe('See [[tools/Foo]] now.');
    expect(result.rewrites).toEqual([{ from: 'old/Foo', to: 'tools/Foo' }]);
  });

  it('preserves an alias and anchor while rewriting the path', () => {
    const result = rewriteWikilinks({
      body: 'See [[old/Foo#Section|the foo]].',
      vaultIndex: indexOf([['Foo', ['tools/Foo.md']]]),
    });

    expect(result.body).toBe('See [[tools/Foo#Section|the foo]].');
  });

  it('preserves the embed prefix while rewriting', () => {
    const result = rewriteWikilinks({
      body: 'Embed ![[old/Foo]] here.',
      vaultIndex: indexOf([['Foo', ['tools/Foo.md']]]),
    });

    expect(result.body).toBe('Embed ![[tools/Foo]] here.');
  });

  it('qualifies a bare-basename link to its canonical path when the basename resolves uniquely', () => {
    const result = rewriteWikilinks({
      body: 'See [[Foo]].',
      vaultIndex: indexOf([['Foo', ['tools/Foo.md']]]),
    });

    expect(result.changed).toBe(true);
    expect(result.body).toBe('See [[tools/Foo]].');
    expect(result.rewrites).toEqual([{ from: 'Foo', to: 'tools/Foo' }]);
  });

  it('leaves a link already at its canonical path unchanged', () => {
    const result = rewriteWikilinks({
      body: 'See [[tools/Foo]].',
      vaultIndex: indexOf([['Foo', ['tools/Foo.md']]]),
    });

    expect(result.changed).toBe(false);
    expect(result.body).toBe('See [[tools/Foo]].');
  });

  it('does not rewrite an unresolved link', () => {
    const result = rewriteWikilinks({ body: 'See [[old/Ghost]].', vaultIndex: indexOf([]) });

    expect(result.changed).toBe(false);
  });

  it('does not rewrite an ambiguous link', () => {
    const result = rewriteWikilinks({
      body: 'See [[old/Foo]].',
      vaultIndex: indexOf([['Foo', ['tools/Foo.md', 'docs/Foo.md']]]),
    });

    expect(result.changed).toBe(false);
  });

  it('does not rewrite a link inside a fenced code block', () => {
    const body = ['```', '[[old/Foo]]', '```'].join('\n');
    const result = rewriteWikilinks({ body, vaultIndex: indexOf([['Foo', ['tools/Foo.md']]]) });

    expect(result.changed).toBe(false);
    expect(result.body).toBe(body);
  });
});
