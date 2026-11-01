import type { AliasMap } from '@williamthorsen/kb';
import type { KbEvent } from '@williamthorsen/kb/records';
import { describe, expect, it } from 'vitest';

import { addTag } from '../add-tag.ts';

const noAliases: AliasMap = new Map();

describe(addTag, () => {
  it('appends new tags after the existing ones', () => {
    const result = addTag(makeEvent({ tags: ['fix'] }), ['obsolete', 'review'], noAliases);
    expect(result.tags).toEqual(['fix', 'obsolete', 'review']);
  });

  it('canonicalizes each added tag through the alias map', () => {
    const aliases: AliasMap = new Map([['js', 'javascript']]);
    const result = addTag(makeEvent({ tags: ['fix'] }), ['js'], aliases);
    expect(result.tags).toEqual(['fix', 'javascript']);
  });

  it('keeps an existing alias-form tag verbatim', () => {
    const aliases: AliasMap = new Map([['js', 'javascript']]);
    const result = addTag(makeEvent({ tags: ['js'] }), ['react'], aliases);
    expect(result.tags).toEqual(['js', 'react']);
  });

  it('drops duplicates among the added tags and against the existing ones', () => {
    const aliases: AliasMap = new Map([['js', 'javascript']]);
    const result = addTag(makeEvent({ tags: ['javascript'] }), ['js', 'react', 'react'], aliases);
    expect(result.tags).toEqual(['javascript', 'react']);
  });

  it('returns the input record itself when every added tag is already present', () => {
    const input = makeEvent({ tags: ['fix', 'obsolete'] });
    expect(addTag(input, ['obsolete'], noAliases)).toBe(input);
  });

  it('leaves addressedBy and extra unchanged', () => {
    const result = addTag(makeEvent({ addressedBy: ['#789'], extra: { repo: 'owner/name' } }), ['new'], noAliases);
    expect(result.addressedBy).toEqual(['#789']);
    expect(result.extra).toEqual({ repo: 'owner/name' });
  });

  it('does not mutate the input record', () => {
    const input = makeEvent({ tags: ['old'] });
    addTag(input, ['new'], noAliases);
    expect(input.tags).toEqual(['old']);
  });
});

// region | Helpers

/** Builds a minimal valid event record, overridable per test. */
function makeEvent(overrides: Partial<KbEvent> = {}): KbEvent {
  return {
    recordType: 'event',
    id: '01HZCEVENTAAAAAAAAAAAAAAAA',
    capturedAt: '2026-06-18T09:41:02Z',
    session: 'session-abc',
    cwd: '/tmp/work',
    summary: 'Noticed a thing',
    tags: [],
    addressedBy: [],
    extra: {},
    body: 'Body.',
    ...overrides,
  };
}

// endregion | Helpers
