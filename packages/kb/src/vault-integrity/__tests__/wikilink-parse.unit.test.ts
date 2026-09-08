import { describe, expect, it } from 'vitest';

import { extractTarget, splitStoreQualifier } from '../wikilink-parse.ts';

describe(splitStoreQualifier, () => {
  it('separates a store qualifier from the target', () => {
    expect(splitStoreQualifier('fde:Note title')).toEqual({ store: 'fde', target: 'Note title' });
  });

  it('reads an unqualified target as store-local', () => {
    expect(splitStoreQualifier('Note title')).toEqual({ target: 'Note title' });
  });

  it('leaves a title whose prefix carries whitespace store-local', () => {
    expect(splitStoreQualifier('Rovo MCP: what it reads')).toEqual({ target: 'Rovo MCP: what it reads' });
  });

  it('leaves a target whose prefix carries a slash store-local', () => {
    expect(splitStoreQualifier('notes/draft:one')).toEqual({ target: 'notes/draft:one' });
  });

  it('leaves a leading colon store-local', () => {
    expect(splitStoreQualifier(':Note title')).toEqual({ target: ':Note title' });
  });

  it('leaves a qualifier with nothing after the colon store-local', () => {
    expect(splitStoreQualifier('fde:')).toEqual({ target: 'fde:' });
  });

  it('splits the same store and target from a link carrying an alias or an anchor', () => {
    const fromAlias = splitStoreQualifier(extractTarget('fde:Note title|the assertion') ?? '');
    const fromAnchor = splitStoreQualifier(extractTarget('fde:Note title#Findings') ?? '');

    expect(fromAlias).toEqual({ store: 'fde', target: 'Note title' });
    expect(fromAnchor).toEqual({ store: 'fde', target: 'Note title' });
  });
});
