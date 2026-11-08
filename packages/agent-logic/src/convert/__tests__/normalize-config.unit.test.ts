import { describe, expect, it } from 'vitest';

import { examples } from '../../examples/examples.ts';
import type { AgentLogicConfig, Finding } from '../../schema/agent-logic-schema.ts';
import { validateConfig } from '../../schema/validate-config.ts';
import { buildMinimalConfig } from '../../test-utils/minimal-config.ts';
import { normalizeConfig, slugifyStateText } from '../normalize-config.ts';

describe(normalizeConfig, () => {
  it('turns two configs that differ only in keys, ids, and order into identical files', () => {
    const variant: AgentLogicConfig = {
      meta: buildMinimalConfig().meta,
      states: {
        finished: { meta: { source: { end: 68, start: 62 } }, type: 'final', id: 'finished' },
        waiting: {
          on: { 'user.replied': [{ meta: { source: { start: 39, end: 60 } }, target: '#finished' }] },
          entry: [{ params: { text: 'greet the user' }, type: 'nl' }],
          meta: { source: { start: 0, end: 38 } },
          id: 'waiting',
        },
      },
      initial: 'waiting',
      id: 'agent',
    };

    expect(serialize(normalizeConfig(variant))).toBe(serialize(normalizeConfig(buildMinimalConfig())));
  });

  it('derives keys, ids, `initial`, and targets from the span text, and keeps the root id', () => {
    const normalized = normalizeConfig(buildMinimalConfig());

    expect(normalized.id).toBe('agent');
    expect(normalized.initial).toBe('greet_the_user_then');
    expect(Object.keys(normalized.states)).toStrictEqual(['greet_the_user_then', 'finish']);
    expect(normalized.states['greet_the_user_then']?.on?.['user.replied']).toMatchObject({ target: '#finish' });
    expect(validateConfig(normalized)).toMatchObject({ ok: true });
  });

  it('keeps the order of the transitions within one list', () => {
    const config = buildMinimalConfig();
    const greeting = config.states['greeting'];
    if (greeting === undefined) throw new Error('fixture lacks greeting');
    greeting.always = [
      { target: '#done', guard: { type: 'nl', params: { text: 'z' } }, meta: { source: { start: 62, end: 68 } } },
      { target: '#greeting', meta: { source: { start: 0, end: 5 } } },
    ];

    const always = normalizeConfig(config).states['greet_the_user_then']?.always;

    expect(Array.isArray(always) && always.map(({ target }) => target)).toStrictEqual([
      '#finish',
      '#greet_the_user_then',
    ]);
  });

  it('gives colliding slugs numbered suffixes in canonical order', () => {
    const config = buildMinimalConfig();
    const done = config.states['done'];
    if (done === undefined) throw new Error('fixture lacks done');
    config.states['done_again'] = { ...done, id: 'done_again', meta: { source: { start: 62, end: 69 } } };

    expect(Object.keys(normalizeConfig(config).states)).toStrictEqual(['greet_the_user_then', 'finish', 'finish_2']);
  });

  it('orders the ambient passages of the root and of a state by span', () => {
    const config = buildMinimalConfig();
    config.meta.ambient = [
      { start: 39, end: 60 },
      { start: 0, end: 5 },
    ];
    const { greeting } = config.states;
    if (greeting === undefined) throw new Error('fixture lacks greeting');
    greeting.meta.ambient = [
      { start: 20, end: 30 },
      { start: 10, end: 15 },
    ];

    const normalized = normalizeConfig(config);

    expect(normalized.meta.ambient).toStrictEqual([
      { start: 0, end: 5 },
      { start: 39, end: 60 },
    ]);
    expect(normalized.states['greet_the_user_then']?.meta.ambient).toStrictEqual([
      { start: 10, end: 15 },
      { start: 20, end: 30 },
    ]);
  });

  it('orders findings by their first source, then kind, and the sources of each by start', () => {
    const config = buildMinimalConfig();
    config.meta.findings = [
      { kind: 'unused-input', sources: [{ start: 39, end: 45 }], reason: 'b' },
      {
        kind: 'unhandled-case',
        sources: [
          { start: 20, end: 25 },
          { start: 0, end: 5 },
        ],
        reason: 'a',
      },
      { kind: 'contradiction', sources: [{ start: 0, end: 5 }], reason: 'c' },
    ];

    expect(normalizeConfig(config).meta.findings).toStrictEqual([
      { kind: 'contradiction', sources: [{ start: 0, end: 5 }], reason: 'c' },
      {
        kind: 'unhandled-case',
        sources: [
          { start: 0, end: 5 },
          { start: 20, end: 25 },
        ],
        reason: 'a',
      },
      { kind: 'unused-input', sources: [{ start: 39, end: 45 }], reason: 'b' },
    ]);
  });

  it('keeps the findings of a state and a transition', () => {
    const config = buildMinimalConfig();
    const { greeting } = config.states;
    const replied = greeting?.on?.['user.replied'];
    if (greeting === undefined || replied === undefined || Array.isArray(replied)) throw new Error('fixture changed');
    const findings: Finding[] = [{ kind: 'unhandled-case', sources: [{ start: 0, end: 5 }], reason: 'x' }];
    greeting.meta.findings = findings;
    replied.meta.findings = findings;

    const state = normalizeConfig(config).states['greet_the_user_then'];

    expect(state?.meta.findings).toStrictEqual(findings);
    expect(state?.on?.['user.replied']).toMatchObject({ meta: { findings } });
  });

  it('keeps the gate flag of a transition, an action, and an ambient passage', () => {
    const config = buildMinimalConfig();
    config.meta.ambient = [{ start: 0, end: 5, gate: true }];
    const { greeting } = config.states;
    if (greeting === undefined) throw new Error('fixture lacks greeting');
    greeting.entry = [{ type: 'nl', params: { text: 'greet' }, meta: { source: { start: 6, end: 10 }, gate: true } }];
    greeting.on = { 'user.replied': { target: '#done', meta: { source: { start: 39, end: 60 }, gate: true } } };

    const normalized = normalizeConfig(config);
    const state = normalized.states['greet_the_user_then'];

    expect(normalized.meta.ambient).toStrictEqual([{ start: 0, end: 5, gate: true }]);
    expect(state?.entry).toStrictEqual([
      { type: 'nl', params: { text: 'greet' }, meta: { source: { start: 6, end: 10 }, gate: true } },
    ]);
    expect(state?.on?.['user.replied']).toMatchObject({ meta: { gate: true } });
  });

  it('keeps the names of the root and of each state, ahead of their other meta members', () => {
    const config = buildMinimalConfig();
    config.meta.name = 'Greeter';
    const greeting = config.states['greeting'];
    if (greeting === undefined) throw new Error('fixture lacks greeting');
    greeting.meta = { source: greeting.meta.source, name: 'Greet the user' };

    const normalized = normalizeConfig(config);

    expect(Object.keys(normalized.meta)[0]).toBe('name');
    expect(normalized.meta.name).toBe('Greeter');
    expect(normalized.states['greet_the_user_then']?.meta).toStrictEqual({
      name: 'Greet the user',
      source: { start: 0, end: 38 },
    });
    expect(Object.keys(normalized.states['greet_the_user_then']?.meta ?? {})[0]).toBe('name');
  });

  it('changes nothing in a config that it has already normalized', () => {
    const once = normalizeConfig(buildMinimalConfig());

    expect(serialize(normalizeConfig(once))).toBe(serialize(once));
  });

  it.each(examples)('keeps the $name example valid', ({ value }) => {
    const result = validateConfig(value);
    if (!result.ok) throw new Error('example is invalid');

    expect(validateConfig(normalizeConfig(result.config))).toMatchObject({ ok: true });
  });
});

describe(slugifyStateText, () => {
  it.each([
    ['Greet the user, then wait for a reply.', 'greet_the_user_then'],
    ["It's done", 'it_s_done'],
    ['3 tries', 's_3_tries'],
    ['—', 'state'],
  ])('derives an id from %j', (text, id) => {
    expect(slugifyStateText(text)).toBe(id);
  });
});

// region | Helpers
function serialize(config: AgentLogicConfig): string {
  return JSON.stringify(config, undefined, 2);
}
// endregion | Helpers
