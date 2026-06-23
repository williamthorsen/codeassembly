import type { AliasMap } from '@codeassembly/kb';
import type { KbEvent } from '@codeassembly/kb/records';
import { describe, expect, it } from 'vitest';

import { retag } from '../retag.ts';

const noAliases: AliasMap = new Map();

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

describe(retag, () => {
  it('replaces the existing tag list', () => {
    const result = retag(makeEvent({ tags: ['old'] }), ['new', 'fresh'], noAliases);
    expect(result.tags).toEqual(['new', 'fresh']);
  });

  it('canonicalizes each tag through the alias map', () => {
    const aliases: AliasMap = new Map([['js', 'javascript']]);
    const result = retag(makeEvent(), ['js', 'react'], aliases);
    expect(result.tags).toEqual(['javascript', 'react']);
  });

  it('de-duplicates when canonicalization collapses aliases onto one canonical', () => {
    const aliases: AliasMap = new Map([
      ['js', 'javascript'],
      ['ecmascript', 'javascript'],
    ]);
    const result = retag(makeEvent(), ['js', 'ecmascript'], aliases);
    expect(result.tags).toEqual(['javascript']);
  });

  it('clears the tags when given an empty list', () => {
    const result = retag(makeEvent({ tags: ['old'] }), [], noAliases);
    expect(result.tags).toEqual([]);
  });

  it('leaves addressedBy and extra unchanged', () => {
    const result = retag(makeEvent({ addressedBy: ['#789'], extra: { repo: 'owner/name' } }), ['new'], noAliases);
    expect(result.addressedBy).toEqual(['#789']);
    expect(result.extra).toEqual({ repo: 'owner/name' });
  });

  it('does not mutate the input record', () => {
    const input = makeEvent({ tags: ['old'] });
    retag(input, ['new'], noAliases);
    expect(input.tags).toEqual(['old']);
  });
});
