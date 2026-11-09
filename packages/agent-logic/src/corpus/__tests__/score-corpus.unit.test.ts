import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildMinimalConfig, MINIMAL_PROMPT } from '../../test-utils/minimal-config.ts';
import { scoreChart } from '../score-chart.ts';
import { readCorpus, renderPromptScore, renderScorecard } from '../score-corpus.ts';

const FIXTURE = path.join(import.meta.dirname, 'fixtures/corpus');
const SOURCES = {
  skill: path.join(import.meta.dirname, 'fixtures/sources/SKILL.md'),
  rules: path.join(import.meta.dirname, 'fixtures/sources/extraction-rules.md'),
};
// `git hash-object` of the fixture sources.
const SKILL_BLOB = 'f888c2767f69';
const RULES_BLOB = '59d89862c8e9';
const OLDER_BLOB = '0123456789abcdef0123456789abcdef01234567';

describe(scoreChart, () => {
  it('counts the elements below the root, the inferred ones, the ambient and unconverted passages, and the reported gaps', () => {
    const { entries } = readCorpus(FIXTURE, SOURCES);
    const greeter = entries.find((entry) => entry.name === 'greeter');
    if (greeter === undefined || !('config' in greeter.output)) throw new Error('The greeter fixture is missing.');

    const score = scoreChart(greeter.prompt, greeter.output.config);

    expect(score).toMatchObject({ states: 3, transitions: 2, inferred: 1, ambient: 1, unconverted: 1 });
    expect(score.reportedGaps).toStrictEqual(['`states.look_up_the_order.on["user.asks_again"]`: no alternative']);
    // "When" and three punctuation marks are outside every span: 8 of 109 non-whitespace characters.
    expect(score.coverage).toBeCloseTo(101 / 109);
  });

  it('reports an unreachable state apart from a state without an exit, on a line of its own', () => {
    const config = buildMinimalConfig();
    config.states = { ...config.states, idle: { id: 'idle', meta: { source: { start: 0, end: 5 } } } };

    expect(scoreChart(MINIMAL_PROMPT, config).reportedGaps).toStrictEqual(['`idle`: no exit', '`idle`: unreachable']);
  });

  it('ignores whitespace when measuring coverage', () => {
    const { entries } = readCorpus(FIXTURE, SOURCES);
    const greeter = entries.find((entry) => entry.name === 'greeter');
    if (greeter === undefined || !('config' in greeter.output)) throw new Error('The greeter fixture is missing.');
    const config = greeter.output.config;
    const padded = `${greeter.prompt}\n\n   \n`;

    expect(scoreChart(padded, config).coverage).toBe(scoreChart(greeter.prompt, config).coverage);
  });
});

describe('scoreChart with a gated action', () => {
  it("counts a gated action's passage as covered", () => {
    const config = buildMinimalConfig();
    const before = scoreChart(MINIMAL_PROMPT, config).coverage;
    const { greeting } = config.states;
    if (greeting === undefined) throw new Error('fixture lacks greeting');
    // The final period lies outside every other span.
    greeting.entry = [{ type: 'nl', params: { text: 'stop' }, meta: { source: { start: 68, end: 69 }, gate: true } }];

    expect(scoreChart(MINIMAL_PROMPT, config).coverage).toBeGreaterThan(before);
  });
});

describe(renderScorecard, () => {
  it('renders the run, a row per converted prompt, the out-of-scope prompts, and every gap', () => {
    const scorecard = renderScorecard(readCorpus(FIXTURE, SOURCES));

    expect(scorecard).toContain(
      'codeassembly 0.20.0 deployed these with `sync --global` at 2026-11-02T10:26:38.594Z, from williamthorsen/codeassembly (ISC), with `codeassembly-guidance` at `111111111111`, `personal` at `222222222222`: greeter.',
    );
    expect(scorecard).toContain(
      'The superpowers@claude-plugins-official plugin 7.0.0, from obra/superpowers at `333333333333` (MIT): rules.',
    );
    expect(scorecard).toContain(
      `\`SKILL.md\` blob \`${SKILL_BLOB}\`, \`docs/extraction-rules.md\` blob \`${RULES_BLOB}\``,
    );
    expect(scorecard).toContain(
      `| greeter | \`${RULES_BLOB}\` | 2 | 3 | 2 | 1 | 1 | 1 | 1 | 93% | pass | fail | fail | pass | pass | pass |`,
    );
    expect(scorecard).toContain(
      `| rules | \`${RULES_BLOB}\` | 1 | pass | The prompt states standing rules but no steps. |`,
    );
    expect(scorecard).toContain('- **Fidelity:** The guard on `user.asks_again` is not stated by the prompt.');
    expect(scorecard).toContain(
      '- **Quote placement:** The transition from `ask_the_user_for` quotes "When the user gives it", which starts with a leading connective.',
    );
    expect(scorecard.endsWith('No gaps found.\n')).toBe(true);
  });

  it('states the recheck of a result converted under older rules', () => {
    const corpus = readCorpus(FIXTURE, SOURCES);
    const entries = corpus.entries.map((entry) =>
      entry.name === 'rules'
        ? {
            ...entry,
            review: {
              ...entry.review,
              rulesBlob: OLDER_BLOB,
              recheck: { ...corpus.current, note: 'None of the changed rules applies.' },
            },
          }
        : entry,
    );

    const scorecard = renderScorecard({ ...corpus, entries });

    expect(scorecard).toContain(`| rules | \`${OLDER_BLOB.slice(0, 12)}\` | 1 |`);
    expect(scorecard).toContain(
      `Converted under rules \`${OLDER_BLOB.slice(0, 12)}\` and rechecked against \`${RULES_BLOB}\`: None of the changed rules applies.`,
    );
  });

  it('renders the same text on every run', () => {
    expect(renderScorecard(readCorpus(FIXTURE, SOURCES))).toBe(renderScorecard(readCorpus(FIXTURE, SOURCES)));
  });
});

describe(renderPromptScore, () => {
  let directory = '';

  beforeEach(() => {
    directory = mkdtempSync(path.join(os.tmpdir(), 'score-prompt-'));
    cpSync(FIXTURE, directory, { recursive: true });
    rmSync(path.join(directory, 'records/greeter.review.json'));
    rmSync(path.join(directory, 'records/rules.review.json'));
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it("reports a chart's measures and the viewer's gaps without a review", () => {
    expect(renderPromptScore(directory, 'greeter')).toBe(
      [
        'greeter:',
        '- States: 3',
        '- Transitions: 2',
        '- Inferred: 1',
        '- Ambient: 1',
        '- Unconverted: 1',
        '- Text in spans: 93%',
        '- Gaps that the viewer reports:',
        '  - `states.look_up_the_order.on["user.asks_again"]`: no alternative',
        '',
      ].join('\n'),
    );
  });

  it('reports an out-of-scope verdict without a review', () => {
    expect(renderPromptScore(directory, 'rules')).toBe(
      'rules: out of scope: The prompt states standing rules but no steps.\n',
    );
  });
});

describe(readCorpus, () => {
  let directory = '';

  beforeEach(() => {
    directory = mkdtempSync(path.join(os.tmpdir(), 'score-corpus-'));
    cpSync(FIXTURE, directory, { recursive: true });
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it.each([
    ['a prompt has no review', 'records/greeter.review.json', undefined, /review\.json/],
    ['a prompt has no output', 'records/rules.problems.json', undefined, /neither/],
    [
      'a failing verdict names no gap',
      'records/greeter.review.json',
      {
        ...readReview('greeter'),
        verdicts: {
          coverage: 'fail',
          fidelity: 'pass',
          placement: 'pass',
          gates: 'pass',
          unconverted: 'pass',
          gapsReport: 'pass',
        },
        gaps: [],
      },
      /fails coverage without naming a gap/,
    ],
    [
      'a failing gates verdict names no gap',
      'records/greeter.review.json',
      {
        ...readReview('greeter'),
        verdicts: {
          coverage: 'pass',
          fidelity: 'fail',
          placement: 'pass',
          gates: 'fail',
          unconverted: 'pass',
          gapsReport: 'pass',
        },
      },
      /fails gates without naming a gap/,
    ],
    [
      'a chart review has no placement verdict',
      'records/greeter.review.json',
      {
        ...readReview('greeter'),
        verdicts: { coverage: 'pass', fidelity: 'fail', gates: 'pass', unconverted: 'pass', gapsReport: 'pass' },
      },
      /placement/,
    ],
    [
      'a failing placement verdict names no gap',
      'records/greeter.review.json',
      {
        ...readReview('greeter'),
        verdicts: {
          coverage: 'pass',
          fidelity: 'pass',
          placement: 'fail',
          gates: 'pass',
          unconverted: 'pass',
          gapsReport: 'pass',
        },
        gaps: [],
      },
      /fails placement without naming a gap/,
    ],
    [
      'a placement gap names a passing criterion',
      'records/greeter.review.json',
      {
        ...readReview('greeter'),
        verdicts: {
          coverage: 'pass',
          fidelity: 'pass',
          placement: 'pass',
          gates: 'pass',
          unconverted: 'pass',
          gapsReport: 'pass',
        },
        gaps: [{ criterion: 'placement', text: 'Starts after the verb.' }],
      },
      /does not fail placement/,
    ],
    [
      'a gap names a passing criterion',
      'records/rules.review.json',
      { ...readReview('rules'), gaps: [{ criterion: 'scope', text: 'Wrong.' }] },
      /does not fail scope/,
    ],
    [
      'a chart has an out-of-scope review',
      'records/greeter.review.json',
      { ...readReview('rules'), convertRuns: 1 },
      /do not match the output/,
    ],
    [
      'a result was converted under older rules and not rechecked',
      'records/rules.review.json',
      { ...readReview('rules'), rulesBlob: OLDER_BLOB },
      /neither converted nor rechecked/,
    ],
    [
      'run.json lists no origin for a prompt',
      'records/run.json',
      { ...readRun(), prompts: { rules: { source: 'superpowers', path: 'skills/rules/SKILL.md' } } },
      /greeter: run\.json lists no origin/,
    ],
    [
      'a prompt names an unknown source',
      'records/run.json',
      {
        ...readRun(),
        prompts: {
          greeter: { source: 'elsewhere', path: 'skills/greeter/SKILL.md' },
          rules: { source: 'superpowers', path: 'skills/rules/SKILL.md' },
        },
      },
      /lists no source "elsewhere"/,
    ],
    [
      'run.json lists a prompt that the corpus does not contain',
      'records/run.json',
      {
        ...readRun(),
        prompts: {
          greeter: { source: 'codeassembly', path: 'skills/greeter/SKILL.md' },
          rules: { source: 'superpowers', path: 'skills/rules/SKILL.md' },
          absent: { source: 'codeassembly', path: 'skills/absent/SKILL.md' },
        },
      },
      /absent: run\.json lists a prompt that the corpus does not contain/,
    ],
  ])('throws when %s', (_condition, file, content, message) => {
    const target = path.join(directory, file);
    if (content === undefined) rmSync(target);
    else writeFileSync(target, JSON.stringify(content));

    expect(() => readCorpus(directory, SOURCES)).toThrow(message);
  });
});

// region | Helpers
/** Reads a fixture review as a plain object, to vary in a test. */
function readReview(name: string): Record<string, unknown> {
  const value: unknown = JSON.parse(readFileSync(path.join(FIXTURE, 'records', `${name}.review.json`), 'utf8'));
  if (typeof value !== 'object' || value === null) throw new Error(`The ${name} review fixture is not an object.`);
  return { ...value };
}

/** Reads the fixture `run.json` as a plain object, to vary in a test. */
function readRun(): Record<string, unknown> {
  const value: unknown = JSON.parse(readFileSync(path.join(FIXTURE, 'records/run.json'), 'utf8'));
  if (typeof value !== 'object' || value === null) throw new Error('The run.json fixture is not an object.');
  return { ...value };
}
// endregion | Helpers
