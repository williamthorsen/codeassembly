import { describe, expect, it } from 'vitest';

import { runCli } from '../cli.ts';
import type { SenseDependencies } from '../sense.ts';

describe('runCli', () => {
  it.each([
    ['an unknown command', ['nope']],
    ['sense without --unit', ['sense', '--out', 'o.json']],
    ['a check without a name', ['sense', '--unit', 'u', '--out', 'o.json', '--check', '=lint']],
    ['a reserved check name', ['sense', '--unit', 'u', '--out', 'o.json', '--check', 'hotspots=x']],
    ['a repeated check name', ['sense', '--unit', 'u', '--out', 'o.json', '--check', 'a=x', '--check', 'a=y']],
    ['a non-numeric window', ['sense', '--unit', 'u', '--out', 'o.json', '--window', 'soon']],
    ['a repeated single-value flag', ['sense', '--unit', 'u', '--unit', 'v', '--out', 'o.json']],
  ])('reports invalid-args for %s', (_label, argv) => {
    expect(runCli(argv, { root: '/nowhere', sense: UNUSED_SENSE })).toMatchObject({ ok: false, error: 'invalid-args' });
  });
});

// region | Helpers

const UNUSED_SENSE: SenseDependencies = {
  git() {
    throw new Error('git must not run');
  },
  runCheck() {
    throw new Error('a check must not run');
  },
};

// endregion | Helpers
