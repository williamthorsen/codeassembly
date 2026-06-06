import { describe, expect, it } from 'vitest';

import { extractInstalledSlugs, injectRulebook, removeRulebook } from '../sentinel-inliner.ts';

describe(injectRulebook, () => {
  it('when content is empty, returns the block with a trailing newline', () => {
    expect(injectRulebook('', 'shell', 'Body text')).toBe(
      '<!-- rulebook:shell -->\nBody text\n<!-- /rulebook:shell -->\n',
    );
  });

  it('appends the block after existing content separated by a blank line', () => {
    expect(injectRulebook('# Title\n', 'shell', 'Body text')).toBe(
      '# Title\n\n<!-- rulebook:shell -->\nBody text\n<!-- /rulebook:shell -->\n',
    );
  });

  it('normalizes a missing trailing newline on existing content before appending', () => {
    expect(injectRulebook('# Title', 'shell', 'Body text')).toBe(
      '# Title\n\n<!-- rulebook:shell -->\nBody text\n<!-- /rulebook:shell -->\n',
    );
  });

  it('when the same slug and body are re-inserted, leaves the document byte-identical', () => {
    const once = injectRulebook('# Title\n', 'shell', 'Body text');
    expect(injectRulebook(once, 'shell', 'Body text')).toBe(once);
  });

  it('trims surrounding whitespace from the body', () => {
    expect(injectRulebook('', 'shell', '\n  Body line  \n\n')).toBe(
      '<!-- rulebook:shell -->\nBody line\n<!-- /rulebook:shell -->\n',
    );
  });

  it('preserves blank lines inside the body', () => {
    expect(injectRulebook('', 'shell', 'Line 1\n\nLine 2')).toBe(
      '<!-- rulebook:shell -->\nLine 1\n\nLine 2\n<!-- /rulebook:shell -->\n',
    );
  });

  it('replaces the body in place when the slug already exists', () => {
    const once = injectRulebook('# Title\n', 'shell', 'Old body');
    const updated = injectRulebook(once, 'shell', 'New body');

    expect(updated).not.toContain('Old body');
    expect(updated).toContain('New body');
    expect(extractInstalledSlugs(updated)).toEqual(['shell']);
  });

  it('preserves an existing block when inserting a different slug', () => {
    const withAlpha = injectRulebook('# Title\n', 'alpha', 'A body');
    const withBoth = injectRulebook(withAlpha, 'beta', 'B body');

    expect(withBoth).toContain('<!-- rulebook:alpha -->\nA body\n<!-- /rulebook:alpha -->');
    expect(extractInstalledSlugs(withBoth)).toEqual(['alpha', 'beta']);
  });
});

describe(removeRulebook, () => {
  it('removes the block and its separator, round-tripping to the original content', () => {
    const once = injectRulebook('# Title\n', 'shell', 'Body text');
    expect(removeRulebook(once, 'shell')).toBe('# Title\n');
  });

  it('when the slug is absent, returns the content unchanged', () => {
    expect(removeRulebook('# Title\n', 'shell')).toBe('# Title\n');
  });

  it('removes only the named block, leaving the others intact', () => {
    const withAlpha = injectRulebook('# Title\n', 'alpha', 'A body');
    const withBoth = injectRulebook(withAlpha, 'beta', 'B body');

    const afterRemoval = removeRulebook(withBoth, 'alpha');

    expect(extractInstalledSlugs(afterRemoval)).toEqual(['beta']);
    expect(afterRemoval).toBe(injectRulebook('# Title\n', 'beta', 'B body'));
  });

  it('when removing a block from an empty-origin document, returns an empty string', () => {
    const only = injectRulebook('', 'shell', 'Body text');
    expect(removeRulebook(only, 'shell')).toBe('');
  });
});

describe(extractInstalledSlugs, () => {
  it('returns slugs that have a complete marker pair, in document order', () => {
    const withBoth = injectRulebook(injectRulebook('', 'alpha', 'A'), 'beta', 'B');
    expect(extractInstalledSlugs(withBoth)).toEqual(['alpha', 'beta']);
  });

  it('when there are no markers, returns an empty array', () => {
    expect(extractInstalledSlugs('# Title\n')).toEqual([]);
  });

  it('ignores an unpaired open marker', () => {
    expect(extractInstalledSlugs('<!-- rulebook:shell -->\nBody text\n')).toEqual([]);
  });
});
