import { describe, expect, it } from 'vitest';

import { extractTarget, scanWikilinks, splitStoreQualifier } from '../wikilink-parse.ts';

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

describe(scanWikilinks, () => {
  it('yields a store-local link with its offset into the body as passed in', () => {
    expect(scanWikilinks('See [[Setting up nvm]] now.').toArray()).toEqual([
      { match: '[[Setting up nvm]]', inner: 'Setting up nvm', offset: 4, target: 'Setting up nvm' },
    ]);
  });

  it('yields a qualified link split into its store and target', () => {
    const [link] = scanWikilinks('See [[fde:Shared assertion|the one]].').toArray();

    expect(link).toMatchObject({ store: 'fde', target: 'Shared assertion', inner: 'fde:Shared assertion|the one' });
  });

  it('skips links inside fenced and inline code, intra-doc anchors, and non-Markdown embeds', () => {
    const body = [
      '```bash',
      'if [[ -n "$x" ]]; then :; fi',
      '```',
      'A `[[inline:One]]` span,',
      '![[a.png]], [[#top]].',
    ].join('\n');

    expect(scanWikilinks(body).toArray()).toEqual([]);
  });

  it('keeps the embed prefix on the match while the target drops it', () => {
    const [link] = scanWikilinks('![[Diagram]]').toArray();

    expect(link).toMatchObject({ match: '![[Diagram]]', target: 'Diagram', offset: 0 });
  });
});
