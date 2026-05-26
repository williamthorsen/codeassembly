import { describe, expect, it } from 'vitest';

import { extractTicketId } from '../extract-ticket-id.ts';

describe(extractTicketId, () => {
  // The behavior table in `_data/ticket-id-extraction.md` is the test oracle. Each row of that
  // table appears here, including the intentional surprises (`feat-2 → FEAT-2`, `feat/foo-2 → FOO-2`).
  describe('behavior table from _data/ticket-id-extraction.md', () => {
    const cases: ReadonlyArray<{ input: string; expected: string | null }> = [
      { input: 'MAC-130', expected: 'MAC-130' },
      { input: 'mac-130', expected: 'MAC-130' },
      { input: 'wt/compPlaN-795', expected: 'COMPPLAN-795' },
      { input: 'wthorsen/MAC-130', expected: 'MAC-130' },
      { input: 'wt/jira-123.1-some-suffix', expected: 'JIRA-123' },
      { input: 'jira-123-1', expected: 'JIRA-123' },
      { input: 'MAC-147-some-description', expected: 'MAC-147' },
      { input: 'feat-2', expected: 'FEAT-2' },
      { input: 'feat/foo-2', expected: 'FOO-2' },
      { input: 'main', expected: null },
    ];

    it.each(cases)('extracts $expected from $input', ({ input, expected }) => {
      const result = extractTicketId({ branchName: input });
      expect(result.ticket_id).toBe(expected);
    });
  });

  describe('Jira-style match', () => {
    it('uppercases a lowercase match', () => {
      expect(extractTicketId({ branchName: 'mac-147' })).toEqual({
        ticket_id: 'MAC-147',
        ticket_ref: 'MAC-147',
      });
    });

    it('terminates the digit run at a dot (sub-ticket suffix)', () => {
      expect(extractTicketId({ branchName: 'NMR-567.2/fix/regression' })).toEqual({
        ticket_id: 'NMR-567',
        ticket_ref: 'NMR-567',
      });
    });

    it('terminates the digit run before a -description suffix', () => {
      expect(extractTicketId({ branchName: 'MAC-147-some-description' })).toEqual({
        ticket_id: 'MAC-147',
        ticket_ref: 'MAC-147',
      });
    });

    it('uses ticket_id as ticket_ref even when a # prefix is configured', () => {
      // For Jira-style matches the prefix is already part of the ID; ticket_ref equals ticket_id.
      expect(extractTicketId({ branchName: 'MAC-130', ticketRefPrefix: '#' })).toEqual({
        ticket_id: 'MAC-130',
        ticket_ref: 'MAC-130',
      });
    });

    it('rejects single-letter prefixes', () => {
      // `a-1` is not a valid ticket ID; the pattern requires two or more letters before the hyphen.
      // The first character `a` is not a digit either, so the bare-numeric fallback also fails.
      expect(extractTicketId({ branchName: 'a-1-test' })).toEqual({
        ticket_id: null,
        ticket_ref: null,
      });
    });
  });

  describe('bare-numeric fallback', () => {
    it('formats a bare number with a Jira-style prefix', () => {
      expect(extractTicketId({ branchName: '147/feat/improve-parser', ticketRefPrefix: 'MAC-' })).toEqual({
        ticket_id: 'MAC-147',
        ticket_ref: 'MAC-147',
      });
    });

    it('returns the bare number when no prefix is configured', () => {
      expect(extractTicketId({ branchName: '42_fix_login-redirect' })).toEqual({
        ticket_id: '42',
        ticket_ref: '42',
      });
    });

    it('renders ticket_ref with # display prefix when configured', () => {
      // `#` is a display-only convention; ticket_id never contains it but ticket_ref does.
      expect(extractTicketId({ branchName: '152', ticketRefPrefix: '#' })).toEqual({
        ticket_id: '152',
        ticket_ref: '#152',
      });
    });

    it('returns null when no Jira-style match and no leading digits', () => {
      expect(extractTicketId({ branchName: 'experiment/try-new-parser' })).toEqual({
        ticket_id: null,
        ticket_ref: null,
      });
    });

    it('treats an empty prefix as no prefix', () => {
      expect(extractTicketId({ branchName: '99', ticketRefPrefix: '' })).toEqual({
        ticket_id: '99',
        ticket_ref: '99',
      });
    });
  });
});
