import { describe, expect, it } from 'vitest';

import { parsePrTicketInput, selectPrTicket } from '../select.ts';

describe(selectPrTicket, () => {
  describe('sources', () => {
    it('takes the first closing reference ahead of any body reference', () => {
      expect(selectPrTicket({ body: 'Closes #3', closingIssueNumbers: [7, 8] })).toEqual({
        number: 7,
        source: 'closing-reference',
      });
    });

    it.each(['closes #12', 'Fixes: #12', 'RESOLVES #12', 'resolves:  #12'])(
      'reads %j as a keyword reference',
      (body) => {
        expect(selectPrTicket({ body, closingIssueNumbers: [] })).toEqual({ number: 12, source: 'body-keyword' });
      },
    );

    it('reads a bare reference', () => {
      expect(selectPrTicket({ body: 'Part of #44.', closingIssueNumbers: [] })).toEqual({
        number: 44,
        source: 'body-bare',
      });
    });

    it('reports none for a body without a reference', () => {
      expect(selectPrTicket({ body: 'Refactors the parser.', closingIssueNumbers: [] })).toEqual({
        number: null,
        source: 'none',
      });
    });
  });

  describe('earliest match', () => {
    it('takes a bare reference that precedes a keyword reference', () => {
      expect(selectPrTicket({ body: 'Follows #5.\n\nCloses #9', closingIssueNumbers: [] })).toEqual({
        number: 5,
        source: 'body-bare',
      });
    });

    it('takes a keyword reference that precedes a bare reference', () => {
      expect(selectPrTicket({ body: 'Fixes #9, see also #5', closingIssueNumbers: [] })).toEqual({
        number: 9,
        source: 'body-keyword',
      });
    });

    it('takes the earlier of two keyword references', () => {
      expect(selectPrTicket({ body: 'Resolves #2\nCloses #1', closingIssueNumbers: [] })).toEqual({
        number: 2,
        source: 'body-keyword',
      });
    });
  });

  describe('references that are not matched', () => {
    it.each([
      ['a cross-repo reference', 'Closes acme/widgets#3'],
      ['a URL fragment', 'See https://example.com/page#3 and https://example.com/#4'],
      ['an HTML entity', 'Uses &#35; as a hash'],
      ['a reference followed by word characters', 'Tag #3a'],
      ['a keyword inside a word', 'autocloses#3'],
    ])('ignores %s', (_label, body) => {
      expect(selectPrTicket({ body, closingIssueNumbers: [] })).toEqual({ number: null, source: 'none' });
    });
  });

  describe('code exclusion', () => {
    it('skips a reference inside an inline code span', () => {
      expect(selectPrTicket({ body: 'Run `git log #1` then see #2', closingIssueNumbers: [] })).toEqual({
        number: 2,
        source: 'body-bare',
      });
    });

    it('skips a reference inside a double-backtick span containing a backtick', () => {
      expect(selectPrTicket({ body: 'Use ``a ` #1`` and #2', closingIssueNumbers: [] })).toEqual({
        number: 2,
        source: 'body-bare',
      });
    });

    it('skips a keyword reference inside a fenced block', () => {
      const body = ['```md', 'Closes #1', '```', '', 'Closes #2'].join('\n');

      expect(selectPrTicket({ body, closingIssueNumbers: [] })).toEqual({ number: 2, source: 'body-keyword' });
    });

    it('skips a reference inside a tilde fence that contains a shorter backtick fence', () => {
      const body = ['~~~~', '```', '#1', '~~~~', '#2'].join('\n');

      expect(selectPrTicket({ body, closingIssueNumbers: [] })).toEqual({ number: 2, source: 'body-bare' });
    });

    it('reads a reference between stray backticks in different paragraphs', () => {
      const body = ['Uses a stray ` backtick.', '', 'Closes #42', '', 'Another ` here'].join('\n');

      expect(selectPrTicket({ body, closingIssueNumbers: [] })).toEqual({ number: 42, source: 'body-keyword' });
    });

    it('treats an unclosed fence as running to the end of the body', () => {
      expect(selectPrTicket({ body: 'Text\n```\n#1', closingIssueNumbers: [] })).toEqual({
        number: null,
        source: 'none',
      });
    });
  });
});

describe(parsePrTicketInput, () => {
  it('reads the body and closing reference numbers', () => {
    expect(
      parsePrTicketInput({
        body: 'Text',
        closingIssuesReferences: [{ number: 3, title: 'T', url: 'https://example.com/3' }],
      }),
    ).toEqual({ body: 'Text', closingIssueNumbers: [3] });
  });

  it('treats a missing or null body and missing references as empty', () => {
    expect(parsePrTicketInput({ body: null })).toEqual({ body: '', closingIssueNumbers: [] });
    expect(parsePrTicketInput({})).toEqual({ body: '', closingIssueNumbers: [] });
  });

  it.each([
    ['a non-object', []],
    ['a non-string body', { body: 3 }],
    ['non-array references', { closingIssuesReferences: {} }],
    ['a reference without a number', { closingIssuesReferences: [{ title: 'T' }] }],
  ])('rejects %s', (_label, value) => {
    expect(() => parsePrTicketInput(value)).toThrow();
  });
});
