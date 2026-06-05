import { describe, expect, it } from 'vitest';

import { documentFor, parseNoteContent } from '../../frontmatter/parse-note.ts';
import { defaultSchema } from '../../schema/default-schema.ts';
import type { VaultIndex } from '../../types.ts';
import { wikilinksRule } from '../wikilinks-rule.ts';

function indexOf(entries: Array<[string, string[]]>): VaultIndex {
  return new Map(entries.map(([key, paths]) => [key, new Set(paths)]));
}

function check(body: string, index: VaultIndex | undefined) {
  const note = parseNoteContent({ content: body, path: 'note.md' });
  return wikilinksRule.check({
    note,
    document: documentFor(note),
    schema: defaultSchema,
    ...(index !== undefined && { vaultIndex: index }),
  });
}

describe('wikilinksRule', () => {
  it('returns no findings when no vault index is supplied', () => {
    expect(check('See [[Anything]].', undefined)).toEqual([]);
  });

  it('passes a wikilink that resolves to a vault note', () => {
    const index = indexOf([['Setting up nvm', ['engineering/Setting up nvm.md']]]);
    expect(check('See [[Setting up nvm]] for details.', index)).toEqual([]);
  });

  it('flags an unresolved wikilink as an error', () => {
    const findings = check('See [[Nonexistent]].', indexOf([]));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.rule).toBe('wikilinks.unresolved');
    expect(findings[0]?.severity).toBe('error');
  });

  it('warns when a basename matches more than one note', () => {
    const index = indexOf([['Foo', ['tools/Foo.md', 'engineering/Foo.md']]]);
    const findings = check('See [[Foo]].', index);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.rule).toBe('wikilinks.ambiguous');
    expect(findings[0]?.severity).toBe('warning');
  });

  it('strips the alias when resolving', () => {
    const index = indexOf([['Foo', ['tools/Foo.md']]]);
    expect(check('See [[Foo|the foo]] now.', index)).toEqual([]);
  });

  it('strips a heading anchor when resolving', () => {
    const index = indexOf([['Foo', ['tools/Foo.md']]]);
    expect(check('Jump to [[Foo#Heading]].', index)).toEqual([]);
  });

  it('skips an intra-document anchor [[#heading]]', () => {
    expect(check('Self ref: [[#section-2]] only.', indexOf([]))).toEqual([]);
  });

  it('treats a .md-suffixed target the same as a bare basename', () => {
    const index = indexOf([['Foo', ['tools/Foo.md']]]);
    expect(check('See [[Foo.md]].', index)).toEqual([]);
  });

  it('resolves a path-qualified target by its basename', () => {
    const index = indexOf([['Foo', ['tools/Foo.md']]]);
    expect(check('See [[tools/Foo]].', index)).toEqual([]);
  });

  it('skips image-extension embeds', () => {
    expect(check('Image: ![[diagram.png]]', indexOf([]))).toEqual([]);
  });

  it('reports the line of the unresolved wikilink', () => {
    const body = ['Line one.', 'Line two with [[Missing]] target.', 'Line three.'].join('\n');
    const findings = check(body, indexOf([]));
    expect(findings[0]?.line).toBe(2);
  });

  it(String.raw`ignores an escaped wikilink \[[Foo]]`, () => {
    expect(check(String.raw`Literal: \[[Foo]] not a link.`, indexOf([]))).toEqual([]);
  });

  it('does not flag wikilink-shaped text inside a fenced code block', () => {
    const body = ['```bash', 'if [[ -n "$x" ]]; then echo hi; fi', '```'].join('\n');
    expect(check(body, indexOf([]))).toEqual([]);
  });

  it('still flags real wikilinks outside a fenced code block', () => {
    const body = ['Before: [[Missing]]', '```bash', '[[ -n "$x" ]]', '```', 'After: [[AlsoMissing]]'].join('\n');
    const findings = check(body, indexOf([]));
    expect(findings.map((finding) => finding.line)).toEqual([1, 5]);
  });

  it('does not flag wikilink-shaped text inside an inline code span', () => {
    expect(check('The `[[plugins]]` block in netlify.toml.', indexOf([]))).toEqual([]);
  });
});
