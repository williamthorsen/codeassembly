import { describe, expect, it } from 'vitest';

import { parseFrontmatterFields, renderFrontmatterFields } from '../yaml-fields.ts';

describe(parseFrontmatterFields, () => {
  it('parses scalar and list fields into an ordered map', () => {
    const { fields, error } = parseFrontmatterFields('title: A note\nrecordType: assertion\ntags: [git, rebase]');
    expect(error).toBeUndefined();
    expect(fields).toEqual({ title: 'A note', recordType: 'assertion', tags: ['git', 'rebase'] });
    expect(Object.keys(fields)).toEqual(['title', 'recordType', 'tags']);
  });

  it('reports an error for malformed YAML', () => {
    const { error } = parseFrontmatterFields('title: [unterminated');
    expect(error).toBeDefined();
  });
});

describe(renderFrontmatterFields, () => {
  it('renders fields in insertion order', () => {
    const text = renderFrontmatterFields({ recordType: 'event', id: '01HZ', summary: 'a glitch' });
    expect(text).toBe('recordType: event\nid: 01HZ\nsummary: a glitch');
  });

  it('round-trips scalars, lists, and YAML-ambiguous strings', () => {
    const fields = { title: 'A note', count: '42', flag: 'true', tags: ['a', 'b'] };
    const reparsed = parseFrontmatterFields(renderFrontmatterFields(fields)).fields;
    expect(reparsed).toEqual(fields);
  });

  it('round-trips a string containing a newline', () => {
    const fields = { note: 'first\nsecond' };
    const reparsed = parseFrontmatterFields(renderFrontmatterFields(fields)).fields;
    expect(reparsed).toEqual(fields);
  });
});
