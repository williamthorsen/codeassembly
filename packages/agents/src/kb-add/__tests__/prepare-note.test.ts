import type { AliasMap } from '@codeassembly/kb';
import { defaultSchema } from '@codeassembly/kb';
import { parseNoteContent, writeFrontmatter } from '@codeassembly/kb/frontmatter';
import { parseAliases } from '@codeassembly/kb/tags';
import { describe, expect, it } from 'vitest';

import { prepareNote } from '../prepare-note.ts';
import type { ParsedArgs } from '../types.ts';

const NOW = new Date('2026-05-24T14:35:00Z');
const TODAY = '2026-05-24T14:35:00Z';

const baseArgs: ParsedArgs = {
  kb: null,
  folder: null,
  diataxis: 'howto',
  title: 'Working with Node streams',
  tags: ['streams'],
};

const emptyAliases: AliasMap = new Map();
const aliases: AliasMap = parseAliases(`
aliases:
  nodejs: [node.js, node]
`);

describe(prepareNote, () => {
  it('writes recordType: assertion as the stored discriminant', () => {
    const result = prepareNote({ args: baseArgs, schema: defaultSchema, aliases: emptyAliases, now: NOW });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.prepared.frontmatter.recordType).toBe('assertion');
    }
  });

  it('writes the Diátaxis --diataxis label into extra, not a top-level field', () => {
    const result = prepareNote({ args: baseArgs, schema: defaultSchema, aliases: emptyAliases, now: NOW });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.prepared.frontmatter.extra.diataxis).toBe('howto');
      expect(result.prepared.frontmatter).not.toHaveProperty('diataxis');
    }
  });

  it('omits the extra diataxis field when --diataxis is not supplied', () => {
    const args: ParsedArgs = { ...baseArgs, diataxis: null };
    const result = prepareNote({ args, schema: defaultSchema, aliases: emptyAliases, now: NOW });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.prepared.frontmatter.extra).not.toHaveProperty('diataxis');
    }
  });

  it('stamps created, updated, and last-verified from one second-precision instant', () => {
    const result = prepareNote({ args: baseArgs, schema: defaultSchema, aliases: emptyAliases, now: NOW });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.prepared.frontmatter.created).toBe(TODAY);
      expect(result.prepared.frontmatter.updated).toBe(TODAY);
      expect(result.prepared.frontmatter.extra['last-verified']).toBe(TODAY);
    }
  });

  it('canonicalizes known-alias tags while preserving the agent-supplied order in originalTags', () => {
    const args: ParsedArgs = { ...baseArgs, tags: ['node.js', 'streams', 'node'] };
    const result = prepareNote({ args, schema: defaultSchema, aliases, now: NOW });

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Original tag list is preserved verbatim for the audit trail, including aliases that collapse onto the same
      // canonical. The written tag list deduplicates in first-occurrence order so the note does not ship
      // semantically duplicate tags like `['nodejs', 'streams', 'nodejs']`.
      expect(result.prepared.originalTags).toEqual(['node.js', 'streams', 'node']);
      expect(result.prepared.canonicalTags).toEqual(['nodejs', 'streams']);
      expect(result.prepared.frontmatter.tags).toEqual(['nodejs', 'streams']);
    }
  });

  it('deduplicates exact-repeat canonical tags in first-occurrence order', () => {
    // Same canonical input twice should resolve to one tag, not two.
    const args: ParsedArgs = { ...baseArgs, tags: ['streams', 'streams', 'nodejs'] };
    const result = prepareNote({ args, schema: defaultSchema, aliases, now: NOW });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.prepared.originalTags).toEqual(['streams', 'streams', 'nodejs']);
      expect(result.prepared.canonicalTags).toEqual(['streams', 'nodejs']);
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

  it('round-trips: rendered frontmatter re-parses back to the prepared shape', () => {
    const args: ParsedArgs = { ...baseArgs, tags: ['node.js', 'streams'] };
    const result = prepareNote({ args, schema: defaultSchema, aliases, now: NOW });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const rendered = writeFrontmatter({ frontmatter: result.prepared.frontmatter, body: '' });
      const parsed = parseNoteContent({ content: rendered });
      expect(parsed.frontmatter).toEqual({
        title: 'Working with Node streams',
        recordType: 'assertion',
        created: TODAY,
        updated: TODAY,
        tags: ['nodejs', 'streams'],
        extra: { diataxis: 'howto', 'last-verified': TODAY },
      });
    }
  });
});
