import type { AliasMap, Schema } from '@codeassembly/kb-core';
import { defaultSchema } from '@codeassembly/kb-core';
import { parseNoteContent, writeFrontmatter } from '@codeassembly/kb-core/frontmatter';
import { parseAliases } from '@codeassembly/kb-core/tags';
import { describe, expect, it } from 'vitest';

import { prepareNote } from '../prepare-note.ts';
import type { ParsedArgs } from '../types.ts';

const NOW = new Date('2026-05-24T14:35:00Z');
const TODAY = '2026-05-24';

const baseArgs: ParsedArgs = {
  kb: null,
  folder: null,
  type: 'howto',
  title: 'Working with Node streams',
  tags: ['streams'],
  lastVerified: null,
};

const emptyAliases: AliasMap = new Map();
const aliases: AliasMap = parseAliases(`
aliases:
  nodejs: [node.js, node]
`);

describe(prepareNote, () => {
  it('fills in UTC created and updated dates from now', () => {
    const result = prepareNote({ args: baseArgs, schema: defaultSchema, aliases: emptyAliases, now: NOW });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.prepared.frontmatter.created).toBe(TODAY);
      expect(result.prepared.frontmatter.updated).toBe(TODAY);
    }
  });

  it('canonicalizes known-alias tags while preserving the agent-supplied order in originalTags', () => {
    const args: ParsedArgs = { ...baseArgs, tags: ['node.js', 'streams', 'node'] };
    const result = prepareNote({ args, schema: defaultSchema, aliases, now: NOW });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.prepared.originalTags).toEqual(['node.js', 'streams', 'node']);
      expect(result.prepared.canonicalTags).toEqual(['nodejs', 'streams', 'nodejs']);
      expect(result.prepared.frontmatter.tags).toEqual(['nodejs', 'streams', 'nodejs']);
    }
  });

  it('passes unknown tags through unchanged', () => {
    const args: ParsedArgs = { ...baseArgs, tags: ['newvocab'] };
    const result = prepareNote({ args, schema: defaultSchema, aliases, now: NOW });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.prepared.canonicalTags).toEqual(['newvocab']);
    }
  });

  it('emits last-verified into the extra map when supplied', () => {
    const args: ParsedArgs = { ...baseArgs, lastVerified: '2026-01-15' };
    const result = prepareNote({ args, schema: defaultSchema, aliases: emptyAliases, now: NOW });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.prepared.frontmatter.extra['last-verified']).toBe('2026-01-15');
    }
  });

  it('round-trips: rendered frontmatter re-parses back to the prepared shape', () => {
    const args: ParsedArgs = { ...baseArgs, lastVerified: '2026-01-15', tags: ['node.js', 'streams'] };
    const result = prepareNote({ args, schema: defaultSchema, aliases, now: NOW });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const rendered = writeFrontmatter({ frontmatter: result.prepared.frontmatter, body: '' });
      const parsed = parseNoteContent({ content: rendered });
      expect(parsed.frontmatter).toEqual({
        title: 'Working with Node streams',
        type: 'howto',
        created: TODAY,
        updated: TODAY,
        tags: ['nodejs', 'streams'],
        extra: { 'last-verified': '2026-01-15' },
      });
    }
  });

  it('refuses to proceed when type is not in the schema vocabulary', () => {
    const args: ParsedArgs = { ...baseArgs, type: 'rant' };
    const result = prepareNote({ args, schema: defaultSchema, aliases: emptyAliases, now: NOW });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.findings.some((finding) => finding.rule === 'frontmatter.type')).toBe(true);
    }
  });

  it('refuses to proceed when last-verified is not a valid YYYY-MM-DD date', () => {
    const args: ParsedArgs = { ...baseArgs, lastVerified: '2026-99-99' };
    const result = prepareNote({ args, schema: defaultSchema, aliases: emptyAliases, now: NOW });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.findings.some((finding) => finding.rule === 'frontmatter.date')).toBe(true);
    }
  });

  it('refuses to proceed when a per-KB schema narrows types and the input type is out of vocabulary', () => {
    const narrowed: Schema = { ...defaultSchema, types: ['concept', 'reference'] };
    const result = prepareNote({ args: baseArgs, schema: narrowed, aliases: emptyAliases, now: NOW });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.findings.some((finding) => finding.rule === 'frontmatter.type')).toBe(true);
    }
  });
});
