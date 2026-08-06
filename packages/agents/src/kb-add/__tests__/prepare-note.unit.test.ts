import type { AliasMap } from '@williamthorsen/kb';
import { parseAssertion, renderAssertion } from '@williamthorsen/kb/records';
import { parseAliases } from '@williamthorsen/kb/tags';
import { describe, expect, it } from 'vitest';

import { prepareNote } from '../prepare-note.ts';
import type { WriteArgs } from '../types.ts';

const NOW = new Date('2026-05-24T14:35:00Z');
const TODAY = '2026-05-24T14:35:00Z';

const baseArgs: WriteArgs = {
  mode: 'write',
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
    const { record } = prepareNote({ args: baseArgs, aliases: emptyAliases, now: NOW, body: '' });

    expect(record.recordType).toBe('assertion');
  });

  it('writes the Diátaxis --diataxis label into extra, not a top-level field', () => {
    const { record } = prepareNote({ args: baseArgs, aliases: emptyAliases, now: NOW, body: '' });

    expect(record.extra.diataxis).toBe('howto');
    expect(record).not.toHaveProperty('diataxis');
  });

  it('omits the extra diataxis field when --diataxis is not supplied', () => {
    const args: WriteArgs = { ...baseArgs, diataxis: null };
    const { record } = prepareNote({ args, aliases: emptyAliases, now: NOW, body: '' });

    expect(record.extra).not.toHaveProperty('diataxis');
  });

  it('stamps created, updated, and last-verified from one second-precision instant', () => {
    const { record } = prepareNote({ args: baseArgs, aliases: emptyAliases, now: NOW, body: '' });

    expect(record.created).toBe(TODAY);
    expect(record.updated).toBe(TODAY);
    expect(record.lastVerified).toBe(TODAY);
  });

  it('carries the note body onto the record', () => {
    const { record } = prepareNote({ args: baseArgs, aliases: emptyAliases, now: NOW, body: 'The body.\n' });

    expect(record.body).toBe('The body.\n');
  });

  it('canonicalizes known-alias tags while preserving the agent-supplied order in originalTags', () => {
    const args: WriteArgs = { ...baseArgs, tags: ['node.js', 'streams', 'node'] };
    const result = prepareNote({ args, aliases, now: NOW, body: '' });

    // Original tag list is preserved verbatim for the audit trail, including aliases that collapse onto the same
    // canonical. The written tag list deduplicates in first-occurrence order so the note does not ship
    // semantically duplicate tags like `['nodejs', 'streams', 'nodejs']`.
    expect(result.originalTags).toEqual(['node.js', 'streams', 'node']);
    expect(result.canonicalTags).toEqual(['nodejs', 'streams']);
    expect(result.record.tags).toEqual(['nodejs', 'streams']);
  });

  it('deduplicates exact-repeat canonical tags in first-occurrence order', () => {
    // Same canonical input twice should resolve to one tag, not two.
    const args: WriteArgs = { ...baseArgs, tags: ['streams', 'streams', 'nodejs'] };
    const result = prepareNote({ args, aliases, now: NOW, body: '' });

    expect(result.originalTags).toEqual(['streams', 'streams', 'nodejs']);
    expect(result.canonicalTags).toEqual(['streams', 'nodejs']);
  });

  it('passes unknown tags through unchanged', () => {
    const args: WriteArgs = { ...baseArgs, tags: ['newvocab'] };
    const result = prepareNote({ args, aliases, now: NOW, body: '' });

    expect(result.canonicalTags).toEqual(['newvocab']);
  });

  it('round-trips: the rendered record re-parses back to the prepared record', () => {
    const args: WriteArgs = { ...baseArgs, tags: ['node.js', 'streams'] };
    const { record } = prepareNote({ args, aliases, now: NOW, body: '\nThe body.\n' });

    const { fields, body } = renderAssertion(record);
    expect(parseAssertion(fields, body)).toEqual({ ok: true, record });
  });
});
