import { describe, expect, it } from 'vitest';

import { validateConfig } from '../../schema/validate-config.ts';
import { convertPrompt, deriveRootId } from '../convert-prompt.ts';

const PROMPT = 'Greet the user, then wait for a reply. When the user replies, finish.';

const DRAFT = {
  initial: 'greeting',
  states: {
    greeting: {
      entry: [{ type: 'nl', params: { text: 'greet the user' } }],
      on: { 'user.replied': { target: '#done', meta: { quote: 'When the user replies' } } },
      meta: { quote: 'Greet the user, then wait for a reply' },
    },
    done: { type: 'final', meta: { quote: 'finish' } },
  },
  meta: { unconverted: [] },
};

describe(convertPrompt, () => {
  it('returns a normalized, valid config and its file text', () => {
    const result = convertPrompt(PROMPT, JSON.stringify(DRAFT), 'prompts/greeter.md');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(validateConfig(result.config)).toMatchObject({ ok: true });
    expect(result.config.id).toBe('greeter');
    expect(Object.keys(result.config.states)).toStrictEqual(['greet_the_user_then', 'finish']);
    expect(result.text).toBe(`${JSON.stringify(result.config, undefined, 2)}\n`);
  });

  it('names each state by its key, and the root by its id, written as words', () => {
    const draft = {
      ...DRAFT,
      initial: 'greet_the_user',
      states: { greet_the_user: DRAFT.states.greeting, done: DRAFT.states.done },
    };

    const result = convertPrompt(PROMPT, JSON.stringify(draft), 'prompts/greeter-agent.md');

    expect(result.ok && result.config.meta.name).toBe('Greeter agent');
    expect(result.ok && Object.values(result.config.states).map(({ meta }) => meta.name)).toStrictEqual([
      'Greet the user',
      'Done',
    ]);
  });

  it('returns the ambient instructions of the root as sorted spans', () => {
    const draft = { ...DRAFT, meta: { unconverted: [], ambient: [{ quote: 'finish' }, { quote: 'Greet the user' }] } };

    const result = convertPrompt(PROMPT, JSON.stringify(draft), 'prompts/greeter.md');

    expect(result.ok && result.config.meta.ambient).toStrictEqual([
      { start: 0, end: 14 },
      { start: 62, end: 68 },
    ]);
  });

  it('reports a gate that the draft leaves outside every quote', () => {
    const gated = `${PROMPT} <HARD-GATE>Never skip the greeting.</HARD-GATE>`;

    const result = convertPrompt(gated, JSON.stringify(DRAFT), 'prompts/greeter.md');

    expect(result).toStrictEqual({
      ok: false,
      problems: [{ path: '', message: expect.stringContaining('The gate "Never skip the greeting." is not quoted') }],
    });
  });

  it.each([
    ['the draft is not JSON', '{', ''],
    [
      'a leaf state has ambient instructions',
      JSON.stringify({
        ...DRAFT,
        states: { ...DRAFT.states, done: { type: 'final', meta: { quote: 'finish', ambient: [{ quote: 'Greet' }] } } },
      }),
      'states.done.meta.ambient',
    ],
    ['the draft does not match the draft schema', JSON.stringify({ ...DRAFT, meta: {} }), 'meta.unconverted'],
    [
      'a quote does not occur in the prompt',
      JSON.stringify({ ...DRAFT, states: { ...DRAFT.states, done: { type: 'final', meta: { quote: 'stop' } } } }),
      'states.done.meta.quote',
    ],
    ['the resolved config is invalid', JSON.stringify({ ...DRAFT, initial: 'missing' }), 'initial'],
    [
      'a target inside a state names a missing state',
      JSON.stringify({
        ...DRAFT,
        states: {
          ...DRAFT.states,
          greeting: {
            ...DRAFT.states.greeting,
            on: { 'user.replied': { target: '#missing', meta: { quote: 'When the user replies' } } },
          },
        },
      }),
      'states.greeting.on["user.replied"].target',
    ],
    [
      'a guard in a transition list is not an object',
      JSON.stringify({
        ...DRAFT,
        states: {
          ...DRAFT.states,
          greeting: {
            ...DRAFT.states.greeting,
            on: { 'user.replied': [{ target: '#done', guard: 'replied', meta: { quote: 'When the user replies' } }] },
          },
        },
      }),
      'states.greeting.on["user.replied"][0].guard',
    ],
  ])('when %s, reports a problem at its path', (_condition, draftText, path) => {
    const result = convertPrompt(PROMPT, draftText, 'greeter.md');

    expect(result.ok).toBe(false);
    expect('problems' in result && result.problems.map((problem) => problem.path)).toContain(path);
  });

  it('returns the verdict of an out-of-scope draft', () => {
    const result = convertPrompt(
      PROMPT,
      JSON.stringify({ outOfScope: { reason: 'It states no steps.' } }),
      'greeter.md',
    );

    expect(result).toStrictEqual({ ok: false, outOfScope: { reason: 'It states no steps.' } });
  });

  it.each([
    ['the reason is blank', { outOfScope: { reason: ' ' } }, 'outOfScope.reason'],
    ['the verdict has another member', { outOfScope: { reason: 'It states no steps.' }, initial: 'greeting' }, ''],
  ])('when %s, reports a problem at its path', (_condition, draft, path) => {
    const result = convertPrompt(PROMPT, JSON.stringify(draft), 'greeter.md');

    expect('problems' in result && result.problems.map((problem) => problem.path)).toContain(path);
  });
});

describe(deriveRootId, () => {
  it.each([
    ['prompts/refund-request.md', 'refund_request'],
    ['2024 Agent.txt', 'a_2024_agent'],
    ['---.md', 'agent'],
  ])('derives the root id of %j', (fileName, id) => {
    expect(deriveRootId(fileName)).toBe(id);
  });
});
