import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { KbRoot, Schema } from '@codeassembly/kb';
import { loadSchema } from '@codeassembly/kb/schema';
import { beforeAll, describe, expect, it } from 'vitest';

import { prepareEvent } from '../prepare-event.ts';
import type { CaptureContext, ParsedArgs } from '../types.ts';

const KIND_AWARE_SCHEMA = `kinds:
  event:
    immutable: true
    recall: recurrence-recency
    required: [id, type, captured-at, session, cwd, summary]
    optional: [repo, skill, model, tags, owner, locality, severity]
    types:
      observation: {}
      mistake:
        required: [correction]
`;

const ID = '01HZZZZZZZZZZZZZZZZZZZZZZZZ';
const CAPTURED_AT = '2026-06-04T06:57:22.000Z';

const CONTEXT: CaptureContext = { session: 'session-abc', cwd: '/tmp/work', repo: 'owner/name' };

function argsFor(overrides: Partial<ParsedArgs>): ParsedArgs {
  return {
    store: 'codeassembly',
    type: 'observation',
    summary: 'Something noticed',
    skill: null,
    model: null,
    tags: [],
    correction: null,
    ...overrides,
  };
}

describe(prepareEvent, () => {
  let schema: Schema;

  beforeAll(async () => {
    const storeRoot = await mkdtemp(join(tmpdir(), 'capture-prepare-'));
    await mkdir(join(storeRoot, '.kb'), { recursive: true });
    await writeFile(join(storeRoot, '.kb', 'schema.yaml'), KIND_AWARE_SCHEMA, 'utf8');
    const kbRoot: KbRoot = { path: storeRoot, kbDir: join(storeRoot, '.kb'), via: 'ancestor-walk' };
    schema = await loadSchema({ kbRoot });
  });

  it('refuses a mistake event with no correction', () => {
    const result = prepareEvent({
      args: argsFor({ type: 'mistake' }),
      context: CONTEXT,
      id: ID,
      capturedAt: CAPTURED_AT,
      schema,
      body: 'A mistake happened.',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.findings.map((finding) => finding.message)).toContain('missing required field: correction');
    }
  });

  it('writes a mistake event when correction is supplied', () => {
    const result = prepareEvent({
      args: argsFor({ type: 'mistake', correction: 'Do it the other way.' }),
      context: CONTEXT,
      id: ID,
      capturedAt: CAPTURED_AT,
      schema,
      body: 'A mistake happened.',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.prepared.content).toContain('correction: Do it the other way.');
    }
  });

  it('writes an observation event carrying only the spine', () => {
    const result = prepareEvent({
      args: argsFor({}),
      context: CONTEXT,
      id: ID,
      capturedAt: CAPTURED_AT,
      schema,
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
      schema,
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
      schema,
      body: '',
    });

    // `repo` is best-effort: a missing remote omits the field and still passes validation.
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.prepared.content).not.toMatch(/^repo:/m);
    }
  });

  it('renders the agent-supplied skill, model, and tags into the record', () => {
    const result = prepareEvent({
      args: argsFor({ skill: 'kb-retrieve', model: 'claude-opus-4-8', tags: ['recall', 'kb'] }),
      context: CONTEXT,
      id: ID,
      capturedAt: CAPTURED_AT,
      schema,
      body: '',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.prepared.content).toContain('skill: kb-retrieve');
      expect(result.prepared.content).toContain('model: claude-opus-4-8');
      expect(result.prepared.content).toContain('tags: [recall, kb]');
    }
  });
});
