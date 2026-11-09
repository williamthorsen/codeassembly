import { describe, expect, it } from 'vitest';

import { buildMinimalConfig } from '../../test-utils/minimal-config.ts';
import type { Finding } from '../agent-logic-schema.ts';
import { formatPath, validateConfig } from '../validate-config.ts';

type Config = ReturnType<typeof buildMinimalConfig>;

describe(validateConfig, () => {
  type ProblemCase = [condition: string, mutate: (config: Config) => unknown, pathFragment: string];

  it('when the config satisfies every rule, returns it', () => {
    const config = buildMinimalConfig();

    expect(validateConfig(config)).toStrictEqual({ ok: true, config });
  });

  it.each<ProblemCase>([
    [
      'the root lacks its prompt',
      (config) => ({ ...config, meta: { ...config.meta, prompt: undefined } }),
      'meta.prompt',
    ],
    ['a state contains an unknown key', (config) => setIn(config, ['states', 'done', 'color'], 'red'), 'states.done'],
    ['an event name is not dotted', (config) => renameEvent(config, 'replied'), 'states.greeting.on'],
    [
      'a target lacks its "#"',
      (config) => setIn(config, ['states', 'greeting', 'on', 'user.replied', 'target'], 'done'),
      '["user.replied"].target',
    ],
    [
      'a guard is not natural language',
      (config) =>
        setIn(config, ['states', 'greeting', 'on', 'user.replied', 'guard'], { type: 'js', params: { text: 'x' } }),
      '["user.replied"]',
    ],
    [
      'a state lacks its source span',
      (config) => setIn(config, ['states', 'done', 'meta'], {}),
      'states.done.meta.source',
    ],
  ])('when %s, reports a shape problem at its path', (_condition, mutate, pathFragment) => {
    expectProblemAt(mutate(buildMinimalConfig()), pathFragment);
  });

  it.each<ProblemCase>([
    ['two states share an id', (config) => setIn(config, ['states', 'done', 'id'], 'greeting'), '.id'],
    [
      'a target names a missing state',
      (config) => setIn(config, ['states', 'greeting', 'on', 'user.replied', 'target'], '#gone'),
      '["user.replied"].target',
    ],
    [
      'a compound state lacks "initial"',
      (config) =>
        setIn(config, ['states', 'greeting', 'states'], {
          inner: { id: 'inner', meta: { source: { start: 0, end: 1 } } },
        }),
      'states.greeting.initial',
    ],
    ['"initial" names a missing child', (config) => ({ ...config, initial: 'gone' }), 'initial'],
    [
      'an atomic state sets "initial"',
      (config) => setIn(config, ['states', 'done', 'initial'], 'x'),
      'states.done.initial',
    ],
    [
      'a span starts after it ends',
      (config) => setIn(config, ['states', 'done', 'meta', 'source'], { start: 9, end: 3 }),
      'states.done.meta.source',
    ],
    [
      'a span ends past the prompt',
      (config) => setIn(config, ['states', 'greeting', 'on', 'user.replied', 'meta', 'source'], { start: 0, end: 999 }),
      'meta.source',
    ],
    [
      'an unconverted span ends past the prompt',
      (config) => setIn(config, ['meta', 'unconverted'], [{ start: 0, end: 999 }]),
      'meta.unconverted[0]',
    ],
    [
      'a leaf state has ambient instructions',
      (config) => setIn(config, ['states', 'done', 'meta', 'ambient'], [{ start: 0, end: 5 }]),
      'states.done.meta.ambient',
    ],
    [
      'an ambient span ends past the prompt',
      (config) => setIn(config, ['meta', 'ambient'], [{ start: 0, end: 999 }]),
      'meta.ambient[0]',
    ],
    [
      'two ambient spans overlap',
      (config) =>
        setIn(
          config,
          ['meta', 'ambient'],
          [
            { start: 0, end: 10 },
            { start: 5, end: 15 },
          ],
        ),
      'meta.ambient[1]',
    ],
    [
      'an ambient span overlaps an unconverted one',
      (config) => ({
        ...config,
        meta: { ...config.meta, unconverted: [{ start: 0, end: 10 }], ambient: [{ start: 5, end: 15 }] },
      }),
      'meta.ambient[0]',
    ],
    [
      'a state is flagged as a gate',
      (config) => setIn(config, ['states', 'greeting', 'meta'], { source: { start: 0, end: 1 }, gate: true }),
      'states.greeting.meta.gate',
    ],
    [
      "a gated action's span ends past the prompt",
      (config) =>
        setIn(
          config,
          ['states', 'greeting', 'entry'],
          [{ type: 'nl', params: { text: 'greet' }, meta: { source: { start: 0, end: 10_000 }, gate: true } }],
        ),
      'states.greeting.entry[0].meta.source',
    ],
    [
      'a final state has a transition',
      (config) =>
        setIn(config, ['states', 'done', 'always'], { target: '#greeting', meta: { source: { start: 0, end: 1 } } }),
      'states.done.type',
    ],
  ])('when %s, reports a semantic problem at its path', (_condition, mutate, pathFragment) => {
    expectProblemAt(mutate(buildMinimalConfig()), pathFragment);
  });

  it('when ambient instructions sit on the root and a compound state apart from other passages, accepts them', () => {
    const config = buildMinimalConfig();
    config.meta.ambient = [{ start: 0, end: 5 }];
    config.meta.unconverted = [{ start: 6, end: 10 }];
    const { greeting } = config.states;
    if (greeting === undefined) throw new Error('fixture lacks the greeting state');
    greeting.initial = 'inner';
    greeting.states = { inner: { id: 'inner', meta: { source: { start: 0, end: 1 } } } };
    greeting.meta.ambient = [{ start: 11, end: 20 }];

    expect(validateConfig(config)).toStrictEqual({ ok: true, config });
  });

  it('accepts a gated transition, a gated action, and a gated ambient instruction', () => {
    const config = buildMinimalConfig();
    config.meta.ambient = [{ start: 0, end: 5, gate: true }];
    const { greeting } = config.states;
    if (greeting === undefined) throw new Error('fixture lacks the greeting state');
    greeting.entry = [{ type: 'nl', params: { text: 'greet' }, meta: { source: { start: 6, end: 10 }, gate: true } }];
    greeting.on = { 'user.replied': { target: '#done', meta: { source: { start: 39, end: 60 }, gate: true } } };

    expect(validateConfig(config)).toStrictEqual({ ok: true, config });
  });

  it.each<[condition: string, target: string, greetingId: string, fix: string]>([
    ['is close to an existing id, names that id', '#dome', 'greeting', 'Use "#done" or another existing state\'s id.'],
    [
      'is far from every id, asks for an existing id',
      '#elsewhere',
      'greeting',
      'Use "#" followed by an existing state\'s id.',
    ],
    ['is equally close to two ids, names the first', '#donx', 'dont', 'Use "#dont" or another existing state\'s id.'],
  ])('when a missing target %s', (_condition, target, greetingId, fix) => {
    const config = buildMinimalConfig();
    const { greeting } = config.states;
    if (greeting === undefined) throw new Error('fixture lacks the greeting state');
    greeting.id = greetingId;
    greeting.on = { 'user.replied': { target, meta: { source: { start: 39, end: 60 } } } };

    expect(listMessages(config)).toContain(`The target "${target}" does not name any state. ${fix}`);
  });

  it('reports a finding source that ends past the prompt', () => {
    const config = buildMinimalConfig();
    config.meta.findings = [{ kind: 'contradiction', sources: [{ start: 0, end: 999 }], reason: 'x' }];

    expectProblemAt(config, 'meta.findings[0].sources[0]');
  });

  it('reports an inferred-resolution finding on the root or on an element that is not inferred', () => {
    const config = buildMinimalConfig();
    const finding: Finding = { kind: 'inferred-resolution', sources: [{ start: 0, end: 5 }], reason: 'x' };
    config.meta.findings = [finding];
    const { greeting } = config.states;
    if (greeting === undefined) throw new Error('fixture lacks greeting');
    greeting.meta.findings = [finding];

    const result = validateConfig(config);

    expect(result.ok ? [] : result.problems.map(({ path }) => path)).toStrictEqual([
      'meta.findings[0].kind',
      'states.greeting.meta.findings[0].kind',
    ]);
  });

  it('accepts an inferred-resolution finding on an inferred element', () => {
    const config = buildMinimalConfig();
    const { greeting } = config.states;
    if (greeting === undefined) throw new Error('fixture lacks greeting');
    greeting.meta.inferred = true;
    greeting.meta.findings = [{ kind: 'inferred-resolution', sources: [{ start: 0, end: 5 }], reason: 'x' }];

    expect(validateConfig(config).ok).toBe(true);
  });
});

describe(formatPath, () => {
  it('joins keys with dots, brackets indexes, and quotes a key that contains a dot', () => {
    expect(formatPath(['states', 'a', 'on', 'user.said', 0, 'target'])).toBe('states.a.on["user.said"][0].target');
  });
});

// region | Helpers
function expectProblemAt(value: unknown, pathFragment: string): void {
  const result = validateConfig(value);

  expect(result.ok).toBe(false);
  expect(result.ok ? [] : result.problems.map((problem) => problem.path)).toContainEqual(
    expect.stringContaining(pathFragment),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
function renameEvent(config: Config, event: string): Config {
  const greeting = config.states['greeting'];
  if (greeting === undefined) throw new Error('fixture lacks the greeting state');
  return {
    ...config,
    states: { ...config.states, greeting: { ...greeting, on: { [event]: greeting.on?.['user.replied'] ?? [] } } },
  };
}

/** Returns a deep copy of the config with the value at the path replaced. */
function setIn(config: Config, path: string[], value: unknown): unknown {
  const copy: unknown = structuredClone(config);
  const parentKeys = path.slice(0, -1);
  let node = copy;
  for (const key of parentKeys) {
    if (!isRecord(node)) throw new Error(`fixture path ends before ${key}`);
    node = node[key];
  }
  const lastKey = path.at(-1);
  if (!isRecord(node) || lastKey === undefined) throw new Error('fixture path does not name a member');
  node[lastKey] = value;
  return copy;
}

/** Returns the message of every problem that validation reports. */
function listMessages(value: unknown): string[] {
  const result = validateConfig(value);
  return result.ok ? [] : result.problems.map((problem) => problem.message);
}

// endregion | Helpers
