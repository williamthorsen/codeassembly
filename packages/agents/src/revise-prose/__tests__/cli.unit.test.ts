import { describe, expect, it } from 'vitest';

import { DEFAULT_BATCH_BUDGET } from '../batch.ts';
import { parseArgs, runDetect } from '../cli.ts';

describe(parseArgs, () => {
  it('reads every positional argument as a path narrowing the sweep', () => {
    expect(parseArgs(['docs', 'packages/agents/README.md']).paths).toStrictEqual(['docs', 'packages/agents/README.md']);
  });

  it('reads no argument as the whole repository, naming no rule and no unit', () => {
    expect(parseArgs([])).toStrictEqual({
      paths: [],
      rules: [],
      units: new Map(),
      budget: DEFAULT_BATCH_BUDGET,
    });
  });

  it('refuses a flag the helper does not recognize', () => {
    expect(() => parseArgs(['--apply'])).toThrow(/unknown flag/i);
  });

  it('reads each named rule with the unit owning it', () => {
    const args = parseArgs(['--unit', 'writing=2', '--rule', 'em-dash=writing']);

    expect(args.rules).toStrictEqual([{ rule: 'em-dash', unit: 'writing' }]);
    expect(args.units).toStrictEqual(new Map([['writing', '2']]));
  });

  it('reads a repeated unit and rule', () => {
    const args = parseArgs([
      '--unit',
      'writing=2',
      '--unit',
      'plain-speech=1',
      '--rule',
      'em-dash=writing',
      '--rule',
      'reduced-object-relative=writing',
    ]);

    expect(args.units.size).toBe(2);
    expect(args.rules.map((named) => named.rule)).toStrictEqual(['em-dash', 'reduced-object-relative']);
  });

  it('refuses a rule the helper holds no detector for', () => {
    expect(() => parseArgs(['--unit', 'writing=2', '--rule', 'sentence-case=writing'])).toThrow(/unknown rule/);
  });

  it('refuses a rule naming a unit no flag declares', () => {
    expect(() => parseArgs(['--rule', 'em-dash=writing'])).toThrow(/which no --unit declares/);
  });

  it('refuses one rule named twice, a rule having one unit', () => {
    expect(() =>
      parseArgs([
        '--unit',
        'writing=2',
        '--unit',
        'plain-speech=1',
        '--rule',
        'em-dash=writing',
        '--rule',
        'em-dash=plain-speech',
      ]),
    ).toThrow(/named twice/);
  });

  it('refuses a pair missing its value', () => {
    expect(() => parseArgs(['--unit', 'writing'])).toThrow(/takes <name>=<value>/);
  });

  it('refuses a batch budget no batch could satisfy', () => {
    expect(() => parseArgs(['--batch-budget', '0'])).toThrow(/positive integer/);
  });

  it('reads a batch budget', () => {
    expect(parseArgs(['--batch-budget', '4096']).budget).toBe(4_096);
  });
});

describe(runDetect, () => {
  it('reports an unknown flag as a structured failure rather than a throw', async () => {
    const result = await runDetect({ argv: ['--apply'], root: process.cwd() });

    expect(result).toStrictEqual({ ok: false, error: 'invalid-args', message: expect.stringMatching(/unknown flag/i) });
  });
});
