import { describe, expect, it } from 'vitest';

import { toRunKey } from '../run-key.js';

describe('toRunKey', () => {
  it('constructs key in projectSlug/ticketId/runId format', () => {
    expect(toRunKey('alpha', 'T-1', 'run-a')).toBe('alpha/T-1/run-a');
  });

  it('handles slugs with special characters', () => {
    expect(toRunKey('my-project', 'TICKET-42', 'run-xyz-123')).toBe('my-project/TICKET-42/run-xyz-123');
  });
});
