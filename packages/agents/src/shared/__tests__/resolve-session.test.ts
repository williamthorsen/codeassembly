import { describe, expect, it } from 'vitest';

import { resolveSession } from '../resolve-session.ts';

describe(resolveSession, () => {
  it('returns the harness-supplied session id', () => {
    expect(resolveSession({ CLAUDE_CODE_SESSION_ID: 'abc123' })).toBe('abc123');
  });

  it('returns undefined when the harness exposes no session id', () => {
    expect(resolveSession({})).toBeUndefined();
  });

  it('treats an empty value as no session rather than an empty id', () => {
    // A harness that defines the variable without populating it has no session to name; an empty string must never
    // reach a consumer as a real id.
    expect(resolveSession({ CLAUDE_CODE_SESSION_ID: '' })).toBeUndefined();
  });
});
