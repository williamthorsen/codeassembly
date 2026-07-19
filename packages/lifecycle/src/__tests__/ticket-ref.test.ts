import { describe, expect, it } from 'vitest';

import { parseTicketRef } from '../ticket-ref.ts';

describe('parseTicketRef', () => {
  it('parses a bare ticket id', () => {
    expect(parseTicketRef('984')).toEqual({ ticketId: '984' });
  });

  it('parses a revisit suffix into an ordinal', () => {
    expect(parseTicketRef('984.2')).toEqual({ ticketId: '984', revisit: 2 });
  });

  it('parses a numeric prefix out of a description-suffixed branch', () => {
    expect(parseTicketRef('357-feat-foo')).toEqual({ ticketId: '357' });
    expect(parseTicketRef('984.2-fix')).toEqual({ ticketId: '984', revisit: 2 });
    expect(parseTicketRef('147/feat/improve-parser')).toEqual({ ticketId: '147' });
  });

  it('parses a Jira-style key anywhere in the name, uppercased', () => {
    expect(parseTicketRef('MAC-130')).toEqual({ ticketId: 'MAC-130' });
    expect(parseTicketRef('mac-130')).toEqual({ ticketId: 'MAC-130' });
    expect(parseTicketRef('wt-MAC-130')).toEqual({ ticketId: 'MAC-130' });
    expect(parseTicketRef('wt/compPlaN-795')).toEqual({ ticketId: 'COMPPLAN-795' });
  });

  it('captures a revisit suffix on a Jira-style key', () => {
    expect(parseTicketRef('NMR-567.2-fix-regression')).toEqual({ ticketId: 'NMR-567', revisit: 2 });
  });

  it('ends the digit run at the first non-digit, per the extraction behavior table', () => {
    expect(parseTicketRef('jira-123-1')).toEqual({ ticketId: 'JIRA-123' });
    expect(parseTicketRef('MAC-147-some-description')).toEqual({ ticketId: 'MAC-147' });
  });

  it('prefers a Jira-style key over a numeric prefix, matching extraction precedence', () => {
    expect(parseTicketRef('42-fix-api-2')).toEqual({ ticketId: 'API-2' });
  });

  it('parses the documented surprise forms as extraction does', () => {
    expect(parseTicketRef('feat-2')).toEqual({ ticketId: 'FEAT-2' });
    expect(parseTicketRef('feat-foo-2')).toEqual({ ticketId: 'FOO-2' });
  });

  it('passes a PR sentinel through for downstream filtering', () => {
    expect(parseTicketRef('PR-123')).toEqual({ ticketId: 'PR-123' });
  });

  it('keeps a bare ticket id as spelled', () => {
    expect(parseTicketRef('0042')).toEqual({ ticketId: '0042' });
  });

  it.each([
    ['the empty string', ''],
    ['a named branch', 'main'],
    ['a single-letter prefix', 'a-1-test'],
    ['a bare revisit suffix', '.2'],
    ['a description without digits', 'fix-login-redirect'],
  ])('yields no ref for %s', (_label, branch) => {
    expect(parseTicketRef(branch)).toBeUndefined();
  });
});
