import { describe, expect, it } from 'vitest';

import { prepareEvent } from '../prepare-event.ts';
import type { CaptureContext, ParsedArgs } from '../types.ts';

const ID = '01HZZZZZZZZZZZZZZZZZZZZZZZZ';
const CAPTURED_AT = '2026-06-04T06:57:22Z';

const CONTEXT: CaptureContext = { session: 'session-abc', cwd: '/tmp/work', repo: 'owner/name' };

function argsFor(overrides: Partial<ParsedArgs>): ParsedArgs {
  return {
    store: 'codeassembly',
    summary: 'Something noticed',
    skill: null,
    model: null,
    harness: null,
    tags: [],
    impact: null,
    amend: null,
    allowPushed: false,
    ...overrides,
  };
}

describe(prepareEvent, () => {
  it('writes recordType: event as the stored discriminant', () => {
    const result = prepareEvent({
      args: argsFor({}),
      context: CONTEXT,
      id: ID,
      capturedAt: CAPTURED_AT,
      body: 'Noticed a thing.',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.prepared.content).toMatch(/^recordType: event$/m);
    }
  });

  it('writes no bare type field', () => {
    const result = prepareEvent({
      args: argsFor({}),
      context: CONTEXT,
      id: ID,
      capturedAt: CAPTURED_AT,
      body: 'Noticed a thing.',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.prepared.content).not.toMatch(/^type:/m);
    }
  });

  it('writes an event carrying the auto-derived id and capturedAt', () => {
    const result = prepareEvent({
      args: argsFor({}),
      context: CONTEXT,
      id: ID,
      capturedAt: CAPTURED_AT,
      body: 'Noticed a thing.',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.prepared.id).toBe(ID);
      expect(result.prepared.capturedAt).toBe(CAPTURED_AT);
    }
  });

  it('omits updated and last-verified from the rendered record', () => {
    const result = prepareEvent({
      args: argsFor({}),
      context: CONTEXT,
      id: ID,
      capturedAt: CAPTURED_AT,
      body: 'Noticed a thing.',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.prepared.content).not.toMatch(/^updated:/m);
      expect(result.prepared.content).not.toMatch(/^last-verified:/m);
    }
  });

  it('writes an event with repo absent when the context has no resolvable remote', () => {
    const result = prepareEvent({
      args: argsFor({}),
      context: { session: 'session-abc', cwd: '/tmp/work' },
      id: ID,
      capturedAt: CAPTURED_AT,
      body: '',
    });

    // `repo` is best-effort: a missing remote omits the field and still passes validation.
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.prepared.content).not.toMatch(/^repo:/m);
    }
  });

  it('writes an event with session absent when the harness exposes no session id', () => {
    const result = prepareEvent({
      args: argsFor({}),
      context: { cwd: '/tmp/work', repo: 'owner/name' },
      id: ID,
      capturedAt: CAPTURED_AT,
      body: '',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.prepared.content).not.toMatch(/^session:/m);
    }
  });

  it('renders the agent-supplied skill, model, harness, and tags into the record', () => {
    const result = prepareEvent({
      args: argsFor({ skill: 'kb-retrieve', model: 'claude-opus-4-8', harness: 'claude', tags: ['recall', 'kb'] }),
      context: CONTEXT,
      id: ID,
      capturedAt: CAPTURED_AT,
      body: '',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.prepared.content).toContain('skill: kb-retrieve');
      expect(result.prepared.content).toContain('model: claude-opus-4-8');
      expect(result.prepared.content).toContain('harness: claude');
      expect(result.prepared.content).toContain('tags: [recall, kb]');
    }
  });

  it('renders the supplied impact into the record', () => {
    const result = prepareEvent({
      args: argsFor({ impact: 'high' }),
      context: CONTEXT,
      id: ID,
      capturedAt: CAPTURED_AT,
      body: '',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.prepared.content).toMatch(/^impact: high$/m);
    }
  });

  it('omits impact when none is supplied', () => {
    const result = prepareEvent({
      args: argsFor({}),
      context: CONTEXT,
      id: ID,
      capturedAt: CAPTURED_AT,
      body: '',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.prepared.content).not.toMatch(/^impact:/m);
    }
  });

  it('renders repo, skill, model, and harness after the typed spine, matching the amend path', () => {
    const result = prepareEvent({
      args: argsFor({
        skill: 'kb-retrieve',
        model: 'claude-opus-4-8',
        harness: 'claude',
        tags: ['recall', 'kb'],
        impact: 'high',
      }),
      context: CONTEXT,
      id: ID,
      capturedAt: CAPTURED_AT,
      body: '',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const lines = result.prepared.content.split('\n');
      const lineOf = (field: string): number => lines.findIndex((line) => line.startsWith(`${field}:`));
      // renderEvent emits the typed spine (summary, tags, impact) before the untyped extra fields
      // (repo, skill, model, harness); pinning that order keeps a fresh capture identical to its later amendment.
      const lastTyped = Math.max(lineOf('summary'), lineOf('tags'), lineOf('impact'));
      const firstExtra = Math.min(lineOf('repo'), lineOf('skill'), lineOf('model'), lineOf('harness'));
      expect(lastTyped).toBeLessThan(firstExtra);
    }
  });
});
