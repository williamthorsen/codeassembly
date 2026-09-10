import path from 'node:path';

import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const PACKAGE_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');

/** The rules the boundary block declares, each keyed to the reach it forecloses. */
const BOUNDARY_RULES = [
  'import-x/no-nodejs-modules',
  'import-x/no-restricted-paths',
  'no-restricted-globals',
  'no-restricted-imports',
];

/**
 * A source breaking all four at once. It is linted under a path already on disk because the TypeScript project
 * service resolves the file before ESLint reaches it, and refuses a path it cannot find.
 */
const VIOLATING_SOURCE = [
  "import { readFile } from 'node:fs/promises';",
  '',
  "import { parse } from 'yaml';",
  '',
  "import { isRecord } from '../lib/type-guards.ts';",
  '',
  'export function probe(): unknown[] {',
  '  return [readFile, parse, isRecord, process.env.HOME];',
  '}',
  '',
].join('\n');

describe('the change-grammar lint boundary', () => {
  it('reports every reach the engine forecloses', { timeout: 60_000 }, async () => {
    const reported = await lintUnder(path.join(PACKAGE_ROOT, 'src', 'change-grammar', 'tokens.ts'));

    expect(reported).toStrictEqual(BOUNDARY_RULES);
  });

  it('binds inside the engine directory alone', { timeout: 60_000 }, async () => {
    const reported = await lintUnder(path.join(PACKAGE_ROOT, 'src', 'lib', 'work-types.ts'));

    expect(reported).toStrictEqual([]);
  });
});

// region | Helpers

/** Lints the violating source as though it were the file at `filePath`, reporting which boundary rules fired. */
async function lintUnder(filePath: string): Promise<string[]> {
  const eslint = new ESLint({ cwd: PACKAGE_ROOT });
  const [result] = await eslint.lintText(VIOLATING_SOURCE, { filePath });
  const fired = new Set(result?.messages.map((message) => message.ruleId));
  return BOUNDARY_RULES.filter((rule) => fired.has(rule));
}

// endregion | Helpers
