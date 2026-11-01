import { describe, expect, it } from 'vitest';

import { runCli } from '../cli.ts';
import { buildContext } from '../test-utils/build-context.ts';

describe('runCli', () => {
  it.each([
    ['an unknown command', ['nope']],
    ['sense without --unit', ['sense', '--out', 'o.json']],
    ['a check without a name', ['sense', '--unit', 'u', '--out', 'o.json', '--check', '=lint']],
    ['a reserved check name', ['sense', '--unit', 'u', '--out', 'o.json', '--check', 'hotspots=x']],
    ['a repeated check name', ['sense', '--unit', 'u', '--out', 'o.json', '--check', 'a=x', '--check', 'a=y']],
    ['a non-numeric window', ['sense', '--unit', 'u', '--out', 'o.json', '--window', 'soon']],
    ['a repeated single-value flag', ['sense', '--unit', 'u', '--unit', 'v', '--out', 'o.json']],
  ])('reports invalid-args for %s', async (_label, argv) => {
    await expect(runCli(argv, buildContext('/nowhere'))).resolves.toMatchObject({ ok: false, error: 'invalid-args' });
  });
});
