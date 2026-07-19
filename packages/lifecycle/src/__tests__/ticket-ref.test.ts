import { describe, expect, it } from 'vitest';

import { parseTicketRef } from '../ticket-ref.ts';

describe('parseTicketRef', () => {
  it('parses a bare ticket id', () => {
    expect(parseTicketRef('984')).toEqual({ ticketId: '984' });
  });

  it('parses a revisit suffix into an ordinal', () => {
    expect(parseTicketRef('984.2')).toEqual({ ticketId: '984', revisit: 2 });
  });

  it('keeps the ticket id as spelled', () => {
    expect(parseTicketRef('0042')).toEqual({ ticketId: '0042' });
  });

  it.each([
    ['the empty string', ''],
    ['a named branch', 'main'],
    ['a synthetic PR ref', 'PR-123'],
    ['a trailing dot', '984.'],
    ['a bare revisit suffix', '.2'],
    ['a second revisit suffix', '984.2.3'],
    ['a description suffix', '984-fix'],
    ['a prefixed id', 'v984'],
  ])('yields no ref for %s', (_label, branch) => {
    expect(parseTicketRef(branch)).toBeUndefined();
  });
});
