import { describe, expect, it } from 'vitest';

import { GREETER_DRAFT, GREETER_MAP, GREETER_PROMPT, MISQUOTED_GREETER_DRAFT } from '../../test-utils/greeter-draft.ts';
import {
  createConversionSession,
  MAX_COVERAGE_CHECKS,
  MAX_SUBMISSIONS,
  type SessionEvent,
} from '../create-conversion-session.ts';

describe(createConversionSession, () => {
  describe('checkCoverage', () => {
    it('reports a fully mapped prompt and emits the check', () => {
      const { session, events } = startSession();

      const reply = session.checkCoverage(GREETER_MAP);

      expect(reply).toBe('Every block of the prompt is mapped. Go on to the next check of the draft.');
      expect(events).toStrictEqual([{ type: 'coverage-checked', check: 1, unmapped: 0, quoteProblems: 0 }]);
    });

    it('lists the unmapped blocks and quote problems with the checks left', () => {
      const { session, events } = startSession();

      const reply = session.checkCoverage([{ quote: 'the user', element: 'greeting' }]);

      expect(reply.split('\n')).toStrictEqual([
        'map[0]: "the user" occurs 2 times',
        'line 1: Greet the user, then wait for a reply.',
        'line 3: When the user replies, finish.',
        'Map every listed block, lengthen every listed quote, and check again. 2 checks left.',
      ]);
      expect(events).toStrictEqual([{ type: 'coverage-checked', check: 1, unmapped: 2, quoteProblems: 1 }]);
    });

    it('answers the last check by telling the agent to go on, and refuses later calls', () => {
      const { session, events } = startSession();
      const partialMap = [{ quote: 'Greet the user', element: 'greeting' }];

      const replies = Array.from({ length: MAX_COVERAGE_CHECKS + 1 }, () => session.checkCoverage(partialMap));

      expect(replies.at(-2)).toMatch(/That was the last coverage check\./);
      expect(replies.at(-1)).toBe('The coverage checks are used up. Go on to the next check of the draft.');
      expect(events).toHaveLength(MAX_COVERAGE_CHECKS);
    });
  });

  describe('submitDraft', () => {
    it('accepts a valid draft as the result', () => {
      const { session, events } = startSession();

      const reply = session.submitDraft(JSON.stringify(GREETER_DRAFT));

      expect(reply).toBe('The config is accepted. End your turn.');
      expect(session.result).toMatchObject({ ok: true, config: { id: 'greeter' } });
      expect(events).toStrictEqual([{ type: 'draft-submitted', submission: 1, outcome: 'config', problems: 0 }]);
    });

    it('records an out-of-scope verdict', () => {
      const { session, events } = startSession();

      const reply = session.submitDraft(JSON.stringify({ outOfScope: { reason: 'It states no steps.' } }));

      expect(reply).toBe('The prompt is recorded as out of scope. End your turn.');
      expect(session.result).toStrictEqual({ ok: false, outOfScope: { reason: 'It states no steps.' } });
      expect(events).toMatchObject([{ outcome: 'out-of-scope', problems: 0 }]);
    });

    it('lists the problems by path with the submissions left', () => {
      const { session, events } = startSession();

      const reply = session.submitDraft(JSON.stringify(MISQUOTED_GREETER_DRAFT));

      const lines = reply.split('\n');
      expect(lines.at(-1)).toBe('Correct every listed entry and submit the draft again. 4 submissions left.');
      expect(lines.slice(0, -1).every((line) => line.startsWith('states.done.meta.quote: '))).toBe(true);
      expect(session.result).toMatchObject({ ok: false, problems: [{ path: 'states.done.meta.quote' }] });
      expect(events).toMatchObject([{ outcome: 'problems', problems: lines.length - 1 }]);
    });

    it('reports a draft that is not JSON as a problem', () => {
      const { session } = startSession();

      const reply = session.submitDraft('{');

      expect(reply).toMatch(/^The draft is not valid JSON: /);
      expect(session.result).toMatchObject({ ok: false, problems: [{ path: '' }] });
    });

    it('keeps the outcome of the last submission', () => {
      const { session } = startSession();

      session.submitDraft(JSON.stringify(GREETER_DRAFT));
      session.submitDraft(JSON.stringify(MISQUOTED_GREETER_DRAFT));

      expect(session.result).toMatchObject({ ok: false, problems: [{ path: 'states.done.meta.quote' }] });
    });

    it('keeps the last accepted submission once the drafts are used up', () => {
      const { session, events } = startSession();

      const replies = Array.from({ length: MAX_SUBMISSIONS }, () =>
        session.submitDraft(JSON.stringify(MISQUOTED_GREETER_DRAFT)),
      );
      const refusal = session.submitDraft(JSON.stringify(GREETER_DRAFT));

      expect(replies.at(-1)).toMatch(/That was the last submission: No more drafts are accepted\. End your turn\.$/);
      expect(refusal).toBe('No more drafts are accepted. End your turn.');
      expect(session.result).toMatchObject({ ok: false, problems: [{ path: 'states.done.meta.quote' }] });
      expect(events).toHaveLength(MAX_SUBMISSIONS);
    });
  });

  describe('isFinished', () => {
    it.each([
      ['an accepted config', GREETER_DRAFT],
      ['an out-of-scope verdict', { outOfScope: { reason: 'It states no steps.' } }],
    ])('is true after %s', (_label, draft) => {
      const { session } = startSession();

      session.submitDraft(JSON.stringify(draft));

      expect(session.isFinished).toBe(true);
    });

    it('stays false through coverage checks and rejected drafts with submissions left', () => {
      const { session } = startSession();

      session.checkCoverage(GREETER_MAP);
      const states = Array.from({ length: MAX_SUBMISSIONS - 1 }, () => {
        session.submitDraft(JSON.stringify(MISQUOTED_GREETER_DRAFT));
        return session.isFinished;
      });

      expect(states).not.toContain(true);
    });

    it('is true once the last submission is rejected', () => {
      const { session } = startSession();

      for (let index = 0; index < MAX_SUBMISSIONS; index += 1) {
        session.submitDraft(JSON.stringify(MISQUOTED_GREETER_DRAFT));
      }

      expect(session.isFinished).toBe(true);
    });
  });
});

// region | Helpers
/** Starts a session on the greeter prompt that records its events. */
function startSession() {
  const events: SessionEvent[] = [];
  const session = createConversionSession({
    prompt: GREETER_PROMPT,
    name: 'greeter.md',
    onEvent: (event) => {
      events.push(event);
    },
  });
  return { session, events };
}
// endregion | Helpers
