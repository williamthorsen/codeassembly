import { describe, expect, it } from 'vitest';

import { validateConfig } from '../../schema/validate-config.ts';
import { type Draft, draftSchema } from '../draft-schema.ts';
import { resolveQuotes } from '../resolve-quotes.ts';

const PROMPT = 'Be friendly. Greet the user, then wait for a reply. When the user replies, finish. Be friendly.';

describe(resolveQuotes, () => {
  it('replaces each quote with the span at which it occurs, and gives each state its key as its id', () => {
    const result = resolveQuotes(buildDraft(), PROMPT, 'agent');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { config } = result;
    expect(validateConfig(config)).toMatchObject({ ok: true });
    expect(config.id).toBe('agent');
    expect(config.meta.source).toStrictEqual({ start: 0, end: PROMPT.length });
    expect(config.states['greeting']?.id).toBe('greeting');
    expect(sliceSpans(config, PROMPT).toSorted()).toStrictEqual([
      'Greet the user, then wait for a reply',
      'When the user replies',
      'finish',
    ]);
  });

  it('keeps the inferred flag of an element', () => {
    const draft = buildDraft();
    const greeting = draft.states['greeting'];
    if (greeting === undefined) throw new Error('fixture lacks greeting');
    greeting.meta.inferred = true;

    const result = resolveQuotes(draft, PROMPT, 'agent');

    expect(result.ok && result.config.states['greeting']?.meta).toStrictEqual({
      name: 'Greeting',
      source: { start: 13, end: 50 },
      inferred: true,
    });
  });

  it('resolves an unconverted passage to its span and keeps its reason', () => {
    const draft = buildDraft();
    draft.meta.unconverted = [{ quote: 'Be friendly. Greet', reason: 'States a tone.' }];

    const result = resolveQuotes(draft, PROMPT, 'agent');

    expect(result.ok && result.config.meta.unconverted).toStrictEqual([
      { start: 0, end: 18, reason: 'States a tone.' },
    ]);
  });

  it('resolves the ambient passages of the root and of a state to their spans', () => {
    const draft = buildDraft();
    draft.meta.ambient = [{ quote: 'Be friendly. Greet' }];
    const greeting = draft.states['greeting'];
    if (greeting === undefined) throw new Error('fixture lacks greeting');
    greeting.meta.ambient = [{ quote: 'finish' }];

    const result = resolveQuotes(draft, PROMPT, 'agent');

    expect(result.ok && result.config.meta.ambient).toStrictEqual([{ start: 0, end: 18 }]);
    expect(result.ok && result.config.states['greeting']?.meta.ambient).toStrictEqual([{ start: 75, end: 81 }]);
  });

  it('reports an ambient quote that occurs more than once at its path', () => {
    const draft = buildDraft();
    draft.meta.ambient = [{ quote: 'Be friendly.' }];

    const result = resolveQuotes(draft, PROMPT, 'agent');

    expect(result.ok ? [] : result.problems.map(({ path }) => path)).toStrictEqual(['meta.ambient[0].quote']);
  });

  it('reports, in one pass, every quote that is missing or occurs more than once', () => {
    const draft = buildDraft();
    draft.meta.unconverted = [{ quote: 'Be friendly.', reason: 'States a tone.' }];
    const done = draft.states['done'];
    if (done === undefined) throw new Error('fixture lacks done');
    done.meta.quote = 'stop';

    expect(resolveQuotes(draft, PROMPT, 'agent')).toStrictEqual({
      ok: false,
      problems: [
        {
          path: 'states.done.meta.quote',
          message: 'The quote "stop" does not occur in the prompt. Copy it verbatim.',
        },
        {
          path: 'meta.unconverted[0].quote',
          message: 'The quote "Be friendly." occurs 2 times in the prompt. Lengthen it until it occurs once.',
        },
      ],
    });
  });
});

describe('resolveQuotes with gates', () => {
  const GATED =
    'Greet the user, then wait for a reply. <HARD-GATE>\nNever skip the greeting.\n</HARD-GATE>\nWhen the user replies, finish.';

  it('resolves a gated action to its span and keeps the gate flag of a transition and an ambient passage', () => {
    const draft = buildDraft();
    const greeting = draft.states['greeting'];
    if (greeting === undefined) throw new Error('fixture lacks greeting');
    greeting.entry = [
      { type: 'nl', params: { text: 'never skip the greeting' }, meta: { quote: 'Never skip', gate: true } },
    ];
    const replied = greeting.on?.['user.replied'];
    if (replied === undefined || Array.isArray(replied)) throw new Error('fixture lacks one user.replied transition');
    replied.meta.gate = true;
    replied.meta.quote = 'skip the greeting';
    draft.meta.ambient = [{ quote: 'the greeting.', gate: true }];

    const result = resolveQuotes(draft, GATED, 'agent');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const state = result.config.states['greeting'];
    expect(state?.entry).toStrictEqual([
      { type: 'nl', params: { text: 'never skip the greeting' }, meta: { source: { start: 51, end: 61 }, gate: true } },
    ]);
    expect(state?.on?.['user.replied']).toMatchObject({ meta: { source: { start: 57, end: 74 }, gate: true } });
    expect(result.config.meta.ambient).toStrictEqual([{ start: 62, end: 75, gate: true }]);
  });

  it("reports a gated action's quote that does not occur at its path", () => {
    const draft = buildDraft();
    const greeting = draft.states['greeting'];
    if (greeting === undefined) throw new Error('fixture lacks greeting');
    greeting.entry = [{ type: 'nl', params: { text: 'skip nothing' }, meta: { quote: 'Never omit', gate: true } }];

    const result = resolveQuotes(draft, GATED, 'agent');

    expect(result.ok ? [] : result.problems.map(({ path }) => path)).toContain('states.greeting.entry[0].meta.quote');
  });
});

describe('resolveQuotes with gate checks', () => {
  const GATED =
    'Greet the user, then wait for a reply. <HARD-GATE>Never skip the greeting.</HARD-GATE> When the user replies, finish.';

  it('reports a gate body that no quote overlaps, naming the gate', () => {
    expect(resolveQuotes(buildDraft(), GATED, 'agent')).toStrictEqual({
      ok: false,
      problems: [
        {
          path: '',
          message:
            'The gate "Never skip the greeting." is not quoted by any element, ambient instruction, or unconverted passage. Represent it as the extraction rules\' Gates section states.',
        },
      ],
    });
  });

  it('accepts a gate body that an unconverted passage overlaps', () => {
    const draft = buildDraft();
    draft.meta.unconverted = [{ quote: 'Never skip', reason: 'Cannot be charted.' }];

    expect(resolveQuotes(draft, GATED, 'agent').ok).toBe(true);
  });

  it('reports a gate flag on a quote that lies outside every gate body, at the flag', () => {
    const draft = buildDraft();
    draft.meta.unconverted = [{ quote: 'Never skip', reason: 'Cannot be charted.' }];
    const done = draft.states['done'];
    if (done === undefined) throw new Error('fixture lacks done');
    draft.meta.ambient = [{ quote: 'When the user replies, finish.', gate: true }];
    done.meta.quote = 'finish.';

    const result = resolveQuotes(draft, GATED, 'agent');

    expect(result.ok ? [] : result.problems).toStrictEqual([
      {
        path: 'meta.ambient[0].gate',
        message:
          'The quote "When the user replies, finish." lies outside every <HARD-GATE> body. Remove "gate", or quote the gate.',
      },
    ]);
  });

  it('ignores a gate inside an HTML comment', () => {
    const commented =
      'Greet the user, then wait for a reply. <!-- <HARD-GATE>Old rule.</HARD-GATE> --> When the user replies, finish.';

    expect(resolveQuotes(buildDraft(), commented, 'agent').ok).toBe(true);
  });
});

describe('resolveQuotes with HTML comments', () => {
  const COMMENTED =
    'Greet the user, then wait for a reply. <!-- include: notes.md / --> When the user replies, finish.';

  it('reports an unconverted quote and an ambient quote of the root and of a state that lie inside a comment', () => {
    const draft = buildDraft();
    draft.meta.unconverted = [{ quote: '<!-- include: notes.md / -->', reason: 'Includes a file.' }];
    draft.meta.ambient = [{ quote: 'include: notes' }];
    const greeting = draft.states['greeting'];
    if (greeting === undefined) throw new Error('fixture lacks greeting');
    greeting.meta.ambient = [{ quote: 'notes.md' }];

    const result = resolveQuotes(draft, COMMENTED, 'agent');

    expect(result.ok ? [] : result.problems).toStrictEqual([
      {
        path: 'states.greeting.meta.ambient[0].quote',
        message: 'The quote "notes.md" lies inside an HTML comment, which is not logic. Leave it out of meta.ambient.',
      },
      {
        path: 'meta.unconverted[0].quote',
        message:
          'The quote "<!-- include: notes.md / -->" lies inside an HTML comment, which is not logic. Leave it out of meta.unconverted.',
      },
      {
        path: 'meta.ambient[0].quote',
        message:
          'The quote "include: notes" lies inside an HTML comment, which is not logic. Leave it out of meta.ambient.',
      },
    ]);
  });

  it('accepts a state quote inside a comment, and unconverted quotes that contain or partly overlap one', () => {
    const draft = buildDraft();
    const done = draft.states['done'];
    if (done === undefined) throw new Error('fixture lacks done');
    done.meta.quote = 'include: notes.md';
    draft.meta.unconverted = [
      { quote: 'reply. <!-- include: notes.md / --> When', reason: 'Contains a comment.' },
      { quote: '/ --> When the user', reason: 'Starts inside a comment.' },
    ];

    expect(resolveQuotes(draft, COMMENTED, 'agent').ok).toBe(true);
  });
});

describe('resolveQuotes with findings', () => {
  it('resolves the quotes of findings on the root, a state, and a transition to their spans', () => {
    const draft = buildDraft();
    draft.meta.findings = [{ kind: 'contradiction', quotes: ['Be friendly. Greet', 'finish. Be'], reason: 'Twice.' }];
    const greeting = draft.states['greeting'];
    if (greeting === undefined) throw new Error('fixture lacks greeting');
    greeting.meta.findings = [{ kind: 'unhandled-case', quotes: ['wait for a reply'], reason: 'No reply.' }];
    const replied = greeting.on?.['user.replied'];
    if (replied === undefined || Array.isArray(replied)) throw new Error('fixture lacks one reply');
    replied.meta.findings = [{ kind: 'unused-input', quotes: ['the user replies'], reason: 'Unused.' }];

    const result = resolveQuotes(draft, PROMPT, 'agent');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.meta.findings).toStrictEqual([
      {
        kind: 'contradiction',
        sources: [
          { start: 0, end: 18 },
          { start: 75, end: 85 },
        ],
        reason: 'Twice.',
      },
    ]);
    const state = result.config.states['greeting'];
    expect(state?.meta.findings).toStrictEqual([
      { kind: 'unhandled-case', sources: [{ start: 34, end: 50 }], reason: 'No reply.' },
    ]);
    expect(state?.on?.['user.replied']).toMatchObject({
      meta: { findings: [{ kind: 'unused-input', sources: [{ start: 57, end: 73 }], reason: 'Unused.' }] },
    });
  });

  it('reports a finding quote that is missing or occurs more than once at its path', () => {
    const draft = buildDraft();
    draft.meta.findings = [{ kind: 'contradiction', quotes: ['Be friendly.', 'Be rude.'], reason: 'Twice.' }];

    const result = resolveQuotes(draft, PROMPT, 'agent');

    expect(result.ok ? [] : result.problems.map(({ path }) => path)).toStrictEqual([
      'meta.findings[0].quotes[0]',
      'meta.findings[0].quotes[1]',
    ]);
  });

  it('reports a finding quote inside a comment', () => {
    const draft = buildDraft();
    draft.meta.findings = [{ kind: 'unused-input', quotes: ['notes.md'], reason: 'Never read.' }];

    const result = resolveQuotes(
      draft,
      'Greet the user, then wait for a reply. <!-- include: notes.md / --> When the user replies, finish.',
      'agent',
    );

    expect(result.ok ? [] : result.problems).toStrictEqual([
      {
        path: 'meta.findings[0].quotes[0]',
        message: 'The quote "notes.md" lies inside an HTML comment, which is not logic. Leave it out of meta.findings.',
      },
    ]);
  });

  it('still reports a gate body that only a finding quotes', () => {
    const draft = buildDraft();
    draft.meta.findings = [{ kind: 'contradiction', quotes: ['Never skip'], reason: 'Conflicts.' }];

    const result = resolveQuotes(
      draft,
      'Greet the user, then wait for a reply. <HARD-GATE>Never skip the greeting.</HARD-GATE> When the user replies, finish.',
      'agent',
    );

    expect(result.ok ? [] : result.problems.map(({ message }) => message)).toStrictEqual([
      expect.stringContaining('The gate "Never skip the greeting." is not quoted'),
    ]);
  });
});

// region | Helpers
function buildDraft(): Draft {
  return draftSchema.parse({
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
  });
}

/** Lists the prompt text of each state's and transition's span. */
function sliceSpans(config: { states: Record<string, unknown> }, prompt: string): string[] {
  const texts: string[] = [];
  JSON.stringify(config.states, (key, value: unknown) => {
    if (key === 'source' && isSpan(value)) texts.push(prompt.slice(value.start, value.end));
    return value;
  });
  return texts;
}

function isSpan(value: unknown): value is { start: number; end: number } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'start' in value &&
    'end' in value &&
    typeof value.start === 'number' &&
    typeof value.end === 'number'
  );
}
// endregion | Helpers
