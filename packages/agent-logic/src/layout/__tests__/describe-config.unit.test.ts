import { describe, expect, it } from 'vitest';

import { passwordReset } from '../../examples/password-reset.ts';
import type { AgentLogicConfig } from '../../schema/agent-logic-schema.ts';
import { validateConfig } from '../../schema/validate-config.ts';
import { buildBranchingConfig } from '../../test-utils/branching-config.ts';
import { buildMinimalConfig } from '../../test-utils/minimal-config.ts';
import {
  buildTransitionLabel,
  describeConfig,
  listGaps,
  listStateKinds,
  listTransitionKinds,
  nameElement,
  type TransitionDescription,
} from '../describe-config.ts';
import supportAgent from './fixtures/support-agent.json' with { type: 'json' };

const TRANSITION: TransitionDescription = {
  kind: 'transition',
  path: 'always',
  sourceId: 'a',
  sourceName: 'a',
  targetId: 'b',
  targetName: 'b',
  event: undefined,
  guard: undefined,
  actions: [],
  isGlobal: false,
  isFallback: false,
  lacksAlternative: false,
  inferred: false,
  gate: false,
  source: { start: 0, end: 1 },
};

describe(describeConfig, () => {
  it("names each state, transition end, and ambient container by the state's name, or by its id when it has none", () => {
    const config = buildMinimalConfig();
    config.meta.ambient = [{ start: 0, end: 14 }];
    config.states['done'] = { id: 'done', type: 'final', meta: { name: 'Finish', source: { start: 62, end: 68 } } };

    const { states, transitions, ambient } = describeConfig(config);

    expect(states.map(({ id, name }) => [id, name])).toStrictEqual([
      ['agent', 'agent'],
      ['greeting', 'greeting'],
      ['done', 'Finish'],
    ]);
    expect(transitions.map(({ sourceName, targetName }) => [sourceName, targetName])).toStrictEqual([
      ['greeting', 'Finish'],
    ]);
    expect(ambient.map(({ containerName }) => containerName)).toStrictEqual(['agent']);
  });

  it('lists the root first and gives each child its parent id', () => {
    const { states } = describeConfig(buildMinimalConfig());

    expect(states.map(({ id, parentId }) => [id, parentId])).toStrictEqual([
      ['agent', undefined],
      ['greeting', 'agent'],
      ['done', 'agent'],
    ]);
  });

  it('marks a leaf state with a `user.` event as waiting for the user, and a compound state as never waiting', () => {
    const config = buildMinimalConfig();
    config.on = { 'user.asks_for_human': { target: '#done', meta: { source: { start: 0, end: 5 } } } };

    const { states } = describeConfig(config);

    expect(states.map(({ id, waitsForUser }) => [id, waitsForUser])).toStrictEqual([
      ['agent', false],
      ['greeting', true],
      ['done', false],
    ]);
  });

  it("marks a compound state's transitions as global, and points a transition without a target at its own state", () => {
    const config = buildMinimalConfig();
    config.on = { 'user.asks_for_help': { meta: { source: { start: 0, end: 5 } } } };

    const { transitions } = describeConfig(config);

    expect(transitions).toContainEqual(
      expect.objectContaining({
        sourceId: 'agent',
        targetId: 'agent',
        isGlobal: true,
        path: 'on["user.asks_for_help"]',
      }),
    );
    expect(transitions).toContainEqual(
      expect.objectContaining({ sourceId: 'greeting', targetId: 'done', isGlobal: false }),
    );
  });

  it('describes the ambient instructions of the root and of a compound state with their container and text', () => {
    const config = buildMinimalConfig();
    config.meta.ambient = [{ start: 0, end: 14 }];
    const { greeting } = config.states;
    if (greeting === undefined) throw new Error('fixture lacks greeting');
    greeting.initial = 'inner';
    greeting.states = { inner: { id: 'inner', meta: { source: { start: 0, end: 1 } } } };
    greeting.meta.ambient = [{ start: 62, end: 68 }];

    expect(describeConfig(config).ambient).toStrictEqual([
      {
        kind: 'ambient',
        path: 'meta.ambient[0]',
        containerId: 'agent',
        containerName: 'agent',
        text: 'Greet the user',
        gate: false,
        source: { start: 0, end: 14 },
      },
      {
        kind: 'ambient',
        path: 'states.greeting.meta.ambient[0]',
        containerId: 'greeting',
        containerName: 'greeting',
        text: 'finish',
        gate: false,
        source: { start: 62, end: 68 },
      },
    ]);
  });

  it("marks the state that its parent's `initial` names as initial", () => {
    const { states } = describeConfig(buildMinimalConfig());

    expect(states.map(({ id, isInitial }) => [id, isInitial])).toStrictEqual([
      ['agent', false],
      ['greeting', true],
      ['done', false],
    ]);
  });

  it('marks an unguarded transition as a fallback only when a sibling in its list has a guard', () => {
    const config = buildMinimalConfig();
    const source = { start: 0, end: 5 };
    config.states = {
      ...config.states,
      greeting: {
        id: 'greeting',
        on: {
          'user.replied': [
            { target: '#done', guard: { type: 'nl', params: { text: 'the reply is yes' } }, meta: { source } },
            { target: '#greeting', meta: { source } },
          ],
          'user.left': { target: '#done', meta: { source } },
        },
        always: { target: '#done', meta: { source } },
        meta: { source },
      },
    };

    const { transitions } = describeConfig(config);

    expect(transitions.map(({ path, isFallback }) => [path, isFallback])).toStrictEqual([
      ['states.greeting.on["user.replied"][0]', false],
      ['states.greeting.on["user.replied"][1]', true],
      ['states.greeting.on["user.left"]', false],
      ['states.greeting.always', false],
    ]);
  });
});

describe(listGaps, () => {
  const source = { start: 0, end: 5 };
  const guard = (text: string) => ({ type: 'nl' as const, params: { text } });

  it('reports a leaf state whose only transitions stay or are global, but not a final or compound state', () => {
    const config = buildMinimalConfig();
    config.on = { 'user.asks_for_human': { target: '#done', meta: { source } } };
    config.states = {
      ...config.states,
      greeting: { id: 'greeting', on: { 'user.adds_note': { meta: { source } } }, meta: { source } },
      looping: { id: 'looping', on: { 'user.retries': { target: '#looping', meta: { source } } }, meta: { source } },
    };

    expect(listGaps(describeConfig(config)).map(({ path }) => path)).toStrictEqual([
      'states.greeting',
      'states.looping',
    ]);
  });

  it('reports the only transition of an event, `always`, or global event when it has a guard, but not a set of guarded siblings', () => {
    const config = buildMinimalConfig();
    config.on = {
      'user.becomes_abusive': { target: '#done', guard: guard('the user swears twice'), meta: { source } },
    };
    config.states = {
      ...config.states,
      greeting: {
        id: 'greeting',
        on: {
          'user.replied': [
            { target: '#done', guard: guard('the reply is yes'), meta: { source } },
            { target: '#done', guard: guard('the reply is no'), meta: { source } },
          ],
        },
        always: { target: '#done', guard: guard('the user is known'), meta: { source } },
        meta: { source },
      },
    };

    expect(listGaps(describeConfig(config)).map(({ path }) => path)).toStrictEqual([
      'on["user.becomes_abusive"]',
      'states.greeting.always',
    ]);
  });

  it('does not report a guarded transition whose trigger an enclosing state handles', () => {
    const config = buildMinimalConfig();
    config.states = {
      ...config.states,
      flow: {
        id: 'flow',
        initial: 'asking',
        on: { 'helper.fails': { target: '#done', meta: { source } } },
        states: {
          asking: {
            id: 'asking',
            on: { 'helper.fails': { target: '#done', guard: guard('the error is retryable'), meta: { source } } },
            meta: { source },
          },
        },
        meta: { source },
      },
    };

    expect(listGaps(describeConfig(config)).map(({ path }) => path)).not.toContain(
      'states.flow.states.asking.on["helper.fails"]',
    );
  });

  it('reports exactly the four states without an exit and the one condition without an alternative of the support-agent fixture', () => {
    const gaps = listGaps(describeConfig(loadConfig(supportAgent)));

    expect(gaps.map((gap) => [gap.kind, gap.kind === 'state' ? gap.id : gap.sourceId])).toStrictEqual([
      ['state', 'send_a_returns_label'],
      ['state', 'send_a_returns_label_2'],
      ['state', 'offer_a_refund_instead'],
      ['transition', 'check_whether_the_address'],
      ['state', 'ask_for_another_address'],
    ]);
  });

  it('does not report the complementary guards of the password-reset example', () => {
    expect(listGaps(describeConfig(loadConfig(passwordReset)))).toStrictEqual([]);
  });
});

describe('describeConfig reachability', () => {
  const source = { start: 0, end: 5 };

  it('marks no state unreachable when the initial states and transitions enter every state', () => {
    const states = describeConfig(buildBranchingConfig()).states;

    expect(states.filter(({ isUnreachable }) => isUnreachable)).toStrictEqual([]);
  });

  it('marks a top-level state that nothing enters as unreachable', () => {
    const config = buildBranchingConfig();
    config.states['orphan'] = { id: 'orphan', type: 'final', meta: { source } };

    const unreachable = describeConfig(config).states.filter(({ isUnreachable }) => isUnreachable);

    expect(unreachable.map(({ id }) => id)).toStrictEqual(['orphan']);
  });

  it('marks only the outermost state of an unreachable flow', () => {
    const config = buildBranchingConfig();
    const asking = config.states['asking'];
    if (asking === undefined) throw new Error('fixture lacks asking');
    asking.on = { 'user.agreed': { target: '#done', meta: { source } } };

    const unreachable = describeConfig(config).states.filter(({ isUnreachable }) => isUnreachable);

    expect(unreachable.map(({ id }) => id)).toStrictEqual(['checking']);
    expect(listGaps(describeConfig(config)).map(({ path }) => path)).toContain('states.checking');
  });

  it("counts a state entered only by a global transition, or by its parent's `initial`, as reachable", () => {
    const config = buildBranchingConfig();
    config.states['escalated'] = { id: 'escalated', type: 'final', meta: { source } };
    const checking = config.states['checking'];
    if (checking === undefined) throw new Error('fixture lacks checking');
    checking.on = { ...checking.on, 'user.asks_for_human': { target: '#escalated', meta: { source } } };

    const states = describeConfig(config).states;

    expect(states.find(({ id }) => id === 'escalated')?.isUnreachable).toBe(false);
    expect(states.find(({ id }) => id === 'looking_up')?.isUnreachable).toBe(false);
  });
});

describe('describeConfig findings', () => {
  it('lists the findings of the root, a state, and a transition, in that order, each with its element', () => {
    const config = buildMinimalConfig();
    const sources = [{ start: 0, end: 5 }];
    config.meta.findings = [{ kind: 'contradiction', sources, reason: 'root' }];
    const { greeting } = config.states;
    const replied = greeting?.on?.['user.replied'];
    if (greeting === undefined || replied === undefined || Array.isArray(replied)) throw new Error('fixture changed');
    replied.meta.findings = [{ kind: 'unused-input', sources, reason: 'transition' }];
    greeting.meta.findings = [{ kind: 'unhandled-case', sources, reason: 'state' }];

    const findings = describeConfig(config).findings;

    expect(
      findings.map(({ path, reason, element }) => [
        path,
        reason,
        element === undefined ? undefined : nameElement(element),
      ]),
    ).toStrictEqual([
      ['meta.findings[0]', 'root', undefined],
      ['states.greeting.meta.findings[0]', 'state', 'greeting'],
      ['states.greeting.on["user.replied"].meta.findings[0]', 'transition', 'greeting, user.replied'],
    ]);
  });
});

describe(buildTransitionLabel, () => {
  it('prefixes a global trigger and lists the guard, then each action', () => {
    const transition = {
      ...TRANSITION,
      event: 'user.asks',
      guard: 'the code is wrong',
      actions: [{ text: 'count the attempt', gate: false, source: undefined }],
      isGlobal: true,
    };

    expect(buildTransitionLabel(transition)).toStrictEqual({
      trigger: 'Any time: user.asks',
      details: ['If the code is wrong', 'Do: count the attempt'],
    });
  });

  it('follows the guard of a condition without an alternative with "no alternative"', () => {
    expect(
      buildTransitionLabel({ ...TRANSITION, event: 'user.replied', guard: 'the reply is yes', lacksAlternative: true }),
    ).toStrictEqual({ trigger: 'user.replied', details: ['If the reply is yes', 'no alternative'] });
  });

  it('labels an eventless transition "always", and a fallback "otherwise"', () => {
    expect(buildTransitionLabel(TRANSITION)).toStrictEqual({ trigger: undefined, details: ['always'] });
    expect(buildTransitionLabel({ ...TRANSITION, isFallback: true })).toStrictEqual({
      trigger: undefined,
      details: ['otherwise'],
    });
    expect(buildTransitionLabel({ ...TRANSITION, event: 'user.left', isFallback: true })).toStrictEqual({
      trigger: 'user.left',
      details: ['otherwise'],
    });
  });

  it('names an eventless global transition "Any time" and keeps its guard slot', () => {
    expect(buildTransitionLabel({ ...TRANSITION, isGlobal: true })).toStrictEqual({
      trigger: 'Any time',
      details: ['always'],
    });
  });

  it('gives an event without a guard no guard line, and ends an inferred label with "inferred"', () => {
    expect(
      buildTransitionLabel({
        ...TRANSITION,
        event: 'user.left',
        actions: [{ text: 'wave', gate: false, source: undefined }],
        inferred: true,
      }),
    ).toStrictEqual({
      trigger: 'user.left',
      details: ['Do: wave', 'inferred'],
    });
  });

  it('ends a gated label with "gate", and marks a gated action', () => {
    expect(
      buildTransitionLabel({
        ...TRANSITION,
        event: 'user.approves',
        actions: [{ text: 'save the ticket', gate: true, source: { start: 0, end: 1 } }],
        inferred: true,
        gate: true,
      }),
    ).toStrictEqual({
      trigger: 'user.approves',
      details: ['Do: save the ticket (gate)', 'inferred', 'gate'],
    });
  });
});

describe('describeConfig with gates', () => {
  it('describes a gated action with its passage, and flags a gated transition and ambient instruction', () => {
    const config = buildMinimalConfig();
    config.meta.ambient = [{ start: 62, end: 68, gate: true }];
    const { greeting } = config.states;
    if (greeting === undefined) throw new Error('fixture lacks greeting');
    greeting.entry = [
      { type: 'nl', params: { text: 'greet the user' }, meta: { source: { start: 0, end: 14 }, gate: true } },
      { type: 'nl', params: { text: 'wait' } },
    ];
    greeting.on = { 'user.replied': { target: '#done', meta: { source: { start: 39, end: 60 }, gate: true } } };

    const description = describeConfig(config);

    expect(description.states[1]?.entry).toStrictEqual([
      { text: 'greet the user', gate: true, source: { start: 0, end: 14 } },
      { text: 'wait', gate: false, source: undefined },
    ]);
    expect(description.transitions[0]?.gate).toBe(true);
    expect(description.ambient).toMatchObject([{ text: 'finish', gate: true, source: { start: 62, end: 68 } }]);
  });
});

describe(listStateKinds, () => {
  it('names each kind that the state has', () => {
    const [, greeting, done] = describeConfig(buildMinimalConfig()).states;

    expect(greeting && listStateKinds(greeting)).toStrictEqual([
      'Starts its flow',
      'Waits for user',
      'Performs actions',
    ]);
    expect(done && listStateKinds(done)).toStrictEqual(['Ends']);
  });

  it('names a state without an exit last', () => {
    const config = buildMinimalConfig();
    config.states = { ...config.states, greeting: { id: 'greeting', meta: { source: { start: 0, end: 5 } } } };
    const [, greeting] = describeConfig(config).states;

    expect(greeting && listStateKinds(greeting)).toStrictEqual(['Starts its flow', 'No exit']);
  });

  it('names an unreachable state after a state without an exit', () => {
    const config = buildMinimalConfig();
    config.states = { ...config.states, idle: { id: 'idle', meta: { source: { start: 0, end: 5 } } } };
    const idle = describeConfig(config).states.find(({ id }) => id === 'idle');

    expect(idle && listStateKinds(idle)).toStrictEqual(['No exit', 'Unreachable']);
  });

  it('names a state that takes a gated action', () => {
    const config = buildMinimalConfig();
    const { greeting } = config.states;
    if (greeting === undefined) throw new Error('fixture lacks greeting');
    greeting.entry = [{ type: 'nl', params: { text: 'greet' }, meta: { source: { start: 0, end: 5 }, gate: true } }];
    const [, described] = describeConfig(config).states;

    expect(described && listStateKinds(described)).toContain('Has a gate');
  });
});

describe(listTransitionKinds, () => {
  it('names each kind that the transition has, in a fixed order', () => {
    expect(listTransitionKinds(TRANSITION)).toStrictEqual([]);
    expect(listTransitionKinds({ ...TRANSITION, inferred: true, isFallback: true, isGlobal: true })).toStrictEqual([
      'Any time',
      'Fallback',
      'Inferred',
    ]);
    expect(listTransitionKinds({ ...TRANSITION, lacksAlternative: true })).toStrictEqual(['No alternative']);
    expect(listTransitionKinds({ ...TRANSITION, inferred: true, gate: true })).toStrictEqual(['Inferred', 'Gate']);
  });
});

// region | Helpers
/** Validates a bundled or fixture config, failing the test when it does not validate. */
function loadConfig(value: unknown): AgentLogicConfig {
  const result = validateConfig(value);
  if (!result.ok) throw new Error(JSON.stringify(result.problems));
  return result.config;
}
// endregion | Helpers
