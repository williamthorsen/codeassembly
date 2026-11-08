import { describe, expect, it } from 'vitest';

import { describeConfig, type StateDescription } from '../../layout/describe-config.ts';
import { buildMinimalConfig, MINIMAL_PROMPT } from '../../test-utils/minimal-config.ts';
import { buildPromptSegments, listElementWords, splitWords } from '../prompt-segments.ts';

describe(buildPromptSegments, () => {
  it('covers the whole prompt with contiguous segments, marking text outside every span as unused', () => {
    const segments = buildPromptSegments(MINIMAL_PROMPT, describeConfig(buildMinimalConfig()), []);

    expect(segments.map(({ text }) => text).join('')).toBe(MINIMAL_PROMPT);
    expect(segments.map(({ start, end, coverage, paths }) => [start, end, coverage, paths])).toEqual([
      [0, 38, 'used', ['states.greeting']],
      [38, 39, 'unused', []],
      [39, 60, 'used', ['states.greeting.on["user.replied"]']],
      [60, 62, 'unused', []],
      [62, 68, 'used', ['states.done']],
      [68, 69, 'unused', []],
    ]);
  });

  it('orders nested spans narrowest first and keeps the description order between spans of equal width', () => {
    const config = buildMinimalConfig();
    // Widen the transition's span to enclose the final state's, and give the final state a twin of equal width.
    const transition = config.states['greeting']?.on?.['user.replied'];
    if (transition === undefined || Array.isArray(transition)) throw new Error('The fixture lacks its transition.');
    transition.meta.source = { start: 39, end: 68 };
    config.states['twin'] = { id: 'twin', meta: { source: { start: 62, end: 68 } } };

    const segments = buildPromptSegments(MINIMAL_PROMPT, describeConfig(config), []);

    expect(segments.find(({ start }) => start === 62)?.paths).toEqual([
      'states.done',
      'states.twin',
      'states.greeting.on["user.replied"]',
    ]);
  });

  it('marks a segment covered by an unconverted span as unconverted, keeping the newlines in its text', () => {
    const prompt = 'Greet.\n\nBe warm.';
    const config = buildMinimalConfig();
    config.meta.prompt = prompt;
    config.states = { greeting: { id: 'greeting', type: 'final', meta: { source: { start: 0, end: 6 } } } };

    const segments = buildPromptSegments(prompt, describeConfig(config), [{ start: 8, end: 16 }]);

    expect(segments.map(({ text, coverage }) => [text, coverage])).toEqual([
      ['Greet.', 'used'],
      ['\n\n', 'unused'],
      ['Be warm.', 'unconverted'],
    ]);
  });
});

describe('buildPromptSegments with ambient instructions', () => {
  it('marks an ambient span as ambient and lists its path, below an unconverted span', () => {
    const prompt = 'Greet.\n\nBe warm. Be kind.';
    const config = buildMinimalConfig();
    config.meta.prompt = prompt;
    config.meta.ambient = [
      { start: 8, end: 16 },
      { start: 17, end: 25 },
    ];
    config.states = { greeting: { id: 'greeting', type: 'final', meta: { source: { start: 0, end: 6 } } } };

    const segments = buildPromptSegments(prompt, describeConfig(config), [{ start: 17, end: 25 }]);

    expect(segments.map(({ text, coverage, paths }) => [text, coverage, paths])).toEqual([
      ['Greet.', 'used', ['states.greeting']],
      ['\n\n', 'unused', []],
      ['Be warm.', 'ambient', ['meta.ambient[0]']],
      [' ', 'unused', []],
      ['Be kind.', 'unconverted', ['meta.ambient[1]']],
    ]);
  });
});

describe('buildPromptSegments with a gated action', () => {
  it("marks a gated action's passage as used by the state that takes the action", () => {
    const prompt = 'Greet.\n\nNever skip.';
    const config = buildMinimalConfig();
    config.meta.prompt = prompt;
    config.states = {
      greeting: {
        id: 'greeting',
        type: 'final',
        entry: [{ type: 'nl', params: { text: 'never skip' }, meta: { source: { start: 8, end: 19 }, gate: true } }],
        meta: { source: { start: 0, end: 6 } },
      },
    };

    const segments = buildPromptSegments(prompt, describeConfig(config), []);

    expect(segments.map(({ text, coverage, paths }) => [text, coverage, paths])).toEqual([
      ['Greet.', 'used', ['states.greeting']],
      ['\n\n', 'unused', []],
      ['Never skip.', 'used', ['states.greeting']],
    ]);
  });
});

describe('buildPromptSegments with HTML comments', () => {
  const PROMPT = 'Greet. <!-- include: a.md / --> <!-- note --> Be warm.';

  it('marks a comment as a comment unless a span covers it, and an element quoting part of it as used', () => {
    const config = buildMinimalConfig();
    config.meta.prompt = PROMPT;
    config.states = {
      greeting: { id: 'greeting', meta: { source: { start: 0, end: 6 } } },
      including: { id: 'including', type: 'final', meta: { source: { start: 12, end: 20 } } },
    };

    const segments = buildPromptSegments(PROMPT, describeConfig(config), [{ start: 32, end: 45 }]);

    expect(segments.map(({ text, coverage }) => [text, coverage])).toEqual([
      ['Greet.', 'used'],
      [' ', 'unused'],
      ['<!-- ', 'comment'],
      ['include:', 'used'],
      [' a.md / -->', 'comment'],
      [' ', 'unused'],
      ['<!-- note -->', 'unconverted'],
      [' Be warm.', 'unused'],
    ]);
  });
});

describe(listElementWords, () => {
  it("lists a state's id and action words without function words", () => {
    const greeting = describeConfig(buildMinimalConfig()).states.find(
      (state): state is StateDescription => state.id === 'greeting',
    );
    if (greeting === undefined) throw new Error('The fixture lacks its greeting state.');

    expect([...listElementWords(greeting)]).toEqual(['greeting', 'greet', 'user']);
  });

  it('lists no words for an ambient instruction, whose passage is its whole text', () => {
    const config = buildMinimalConfig();
    config.meta.ambient = [{ start: 0, end: 14 }];
    const [ambient] = describeConfig(config).ambient;
    if (ambient === undefined) throw new Error('fixture lacks its ambient instruction');

    expect(listElementWords(ambient).size).toBe(0);
  });
});

describe(splitWords, () => {
  it('splits identifiers and prose into lowercase words', () => {
    expect(splitWords('ask_for_order If the Order is old')).toEqual(['ask', 'order', 'order', 'old']);
  });
});
