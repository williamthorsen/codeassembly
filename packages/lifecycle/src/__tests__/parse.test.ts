import { assert, describe, expect, it } from 'vitest';

import { parseEventLine, parseLanePath } from '../parse.ts';

/** A minimal valid envelope line; tests override or delete fields from this base. */
function composeLine(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    ts: '2026-07-19T05:00:00.000Z',
    type: 'skill.started',
    cwd: '/work/repo',
    payload: { skill: 'design-and-plan' },
    ...overrides,
  });
}

describe('parseEventLine', () => {
  it('parses a full envelope, carrying optional fields through', () => {
    const line = composeLine({ repo: 'owner/name', branch: '1035', session: 'abc', harness: 'claude' });

    const envelope = parseEventLine(line);

    assert(envelope !== null, 'A valid line should parse');
    expect(envelope).toEqual({
      id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      ts: '2026-07-19T05:00:00.000Z',
      type: 'skill.started',
      repo: 'owner/name',
      branch: '1035',
      session: 'abc',
      cwd: '/work/repo',
      harness: 'claude',
      payload: { skill: 'design-and-plan' },
    });
  });

  it('omits optional fields that are absent or not strings', () => {
    const envelope = parseEventLine(composeLine({ repo: 42 }));

    assert(envelope !== null, 'The line should parse despite a malformed optional field');
    expect('repo' in envelope).toBe(false);
    expect('branch' in envelope).toBe(false);
  });

  it('accepts an undeclared event type', () => {
    const envelope = parseEventLine(composeLine({ type: 'merge.completed' }));

    assert(envelope !== null, 'An undeclared type should still parse');
    expect(envelope.type).toBe('merge.completed');
  });

  it('defaults a missing payload to an empty object', () => {
    const envelope = parseEventLine(composeLine({ payload: undefined }));

    assert(envelope !== null, 'The line should parse without a payload');
    expect(envelope.payload).toEqual({});
  });

  it('defaults a non-object payload to an empty object', () => {
    const envelope = parseEventLine(composeLine({ payload: 'not-an-object' }));

    assert(envelope !== null, 'The line should parse despite a malformed payload');
    expect(envelope.payload).toEqual({});
  });

  it.each([
    ['malformed JSON', '{"id": "trunc'],
    ['a JSON array', '[1, 2]'],
    ['a JSON string', '"hello"'],
    ['a missing id', composeLine({ id: undefined })],
    ['a non-string ts', composeLine({ ts: 123 })],
    ['a missing type', composeLine({ type: undefined })],
    ['a missing cwd', composeLine({ cwd: undefined })],
  ])('returns null for %s', (_label, line) => {
    expect(parseEventLine(line)).toBeNull();
  });
});

describe('parseLanePath', () => {
  it('parses an owner/name/branch/session.jsonl leaf', () => {
    expect(parseLanePath('williamthorsen/codeassembly/1035/abc-123.jsonl')).toEqual({
      repo: 'williamthorsen/codeassembly',
      branch: '1035',
      session: 'abc-123',
    });
  });

  it('parses backslash separators identically', () => {
    expect(parseLanePath(String.raw`owner\name\main\s1.jsonl`)).toEqual({
      repo: 'owner/name',
      branch: 'main',
      session: 's1',
    });
  });

  it('reports placeholder segments as spelled', () => {
    const lane = parseLanePath('_no-repo/_no-repo/_no-branch/_no-session.jsonl');

    expect(lane).toEqual({ repo: '_no-repo/_no-repo', branch: '_no-branch', session: '_no-session' });
  });

  it.each([
    ['too few segments', 'owner/name/session.jsonl'],
    ['too many segments', 'root/owner/name/branch/session.jsonl'],
    ['a non-jsonl leaf', 'owner/name/branch/notes.md'],
    ['an empty branch segment', 'owner/name//session.jsonl'],
    ['an empty session name', 'owner/name/branch/.jsonl'],
  ])('returns null for %s', (_label, path) => {
    expect(parseLanePath(path)).toBeNull();
  });
});
