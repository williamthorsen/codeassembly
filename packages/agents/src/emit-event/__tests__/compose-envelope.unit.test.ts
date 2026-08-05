import { describe, expect, it } from 'vitest';

import { composeEnvelope } from '../compose-envelope.ts';

const ID = '01HZZZZZZZZZZZZZZZZZZZZZZZZ';

const NOW = new Date('2026-07-14T14:10:46.123Z');

describe(composeEnvelope, () => {
  it('composes the full envelope from a complete context', () => {
    const envelope = composeEnvelope({
      id: ID,
      now: NOW,
      type: 'skill.started',
      context: {
        repo: 'williamthorsen/codeassembly',
        branch: 'MAC-42/feat/thing',
        session: 'abc123',
        cwd: '/repos/codeassembly',
        harness: 'claude',
      },
      payload: { skill: 'plan' },
    });

    expect(envelope).toEqual({
      id: ID,
      ts: '2026-07-14T14:10:46.123Z',
      type: 'skill.started',
      repo: 'williamthorsen/codeassembly',
      branch: 'MAC-42/feat/thing',
      session: 'abc123',
      cwd: '/repos/codeassembly',
      harness: 'claude',
      payload: { skill: 'plan' },
    });
  });

  it('stamps ts at millisecond precision', () => {
    const envelope = composeEnvelope({ id: ID, now: NOW, type: 'skill.progress', context: { cwd: '/x' }, payload: {} });

    expect(envelope.ts).toBe('2026-07-14T14:10:46.123Z');
  });

  it('omits every unresolvable context field rather than carrying its path placeholder', () => {
    // The placeholders exist so an event still lands somewhere on disk. Carrying one into the envelope would leave a
    // consumer unable to tell an unresolved repo from one genuinely named `_no-repo`.
    const envelope = composeEnvelope({
      id: ID,
      now: NOW,
      type: 'skill.completed',
      context: { cwd: '/x' },
      payload: {},
    });

    expect(envelope).toEqual({
      id: ID,
      ts: '2026-07-14T14:10:46.123Z',
      type: 'skill.completed',
      cwd: '/x',
      payload: {},
    });
    expect(Object.keys(envelope)).not.toContain('repo');
    expect(Object.keys(envelope)).not.toContain('branch');
    expect(Object.keys(envelope)).not.toContain('session');
    expect(Object.keys(envelope)).not.toContain('harness');
  });

  it('carries an undeclared type through unchanged', () => {
    const envelope = composeEnvelope({ id: ID, now: NOW, type: 'skill.invented', context: { cwd: '/x' }, payload: {} });

    expect(envelope.type).toBe('skill.invented');
  });
});
