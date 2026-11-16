import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { run } from '../run.ts';

describe(run, () => {
  it.each([[[]], [['--help']], [['-h']]])('prints usage naming every command and exits 0 for %j', async (argv) => {
    const output = await run(argv);

    expect(output.exitCode).toBe(0);
    expect(output.stdout).toMatch(/convert[\s\S]*convert-with-agent[\s\S]*check-coverage[\s\S]*rules/);
    expect(output.stderr).toBe('');
  });

  it("prints the package's version for --version", async () => {
    expect((await run(['--version'])).stdout).toBe(`${MANIFEST_VERSION}\n`);
  });

  it('names an unknown command and exits 2', async () => {
    const output = await run(['chart']);

    expect(output.exitCode).toBe(2);
    expect(output.stderr).toContain('unknown command: chart');
    expect(output.stdout).toBe('');
  });

  it.each([['convert'], ['convert-with-agent'], ['check-coverage'], ['rules']])(
    'dispatches --help to %s',
    async (command) => {
      const output = await run([command, '--help']);

      expect(output.exitCode).toBe(0);
      expect(output.stdout).toContain(`Usage: agent-logic ${command}`);
    },
  );

  it('prints the extraction rules that the package ships for rules', async () => {
    expect((await run(['rules'])).stdout).toBe(
      readFileSync(path.join(PACKAGE_ROOT, 'docs/extraction-rules.md'), 'utf8'),
    );
  });

  it('rejects an argument to rules and exits 2', async () => {
    const output = await run(['rules', 'extra']);

    expect(output.exitCode).toBe(2);
    expect(output.stderr).toContain('expected no arguments');
  });
});

// region | Helpers
const PACKAGE_ROOT = path.join(import.meta.dirname, '../../..');

const MANIFEST_VERSION = readManifestVersion();

function readManifestVersion(): string {
  const manifest: unknown = JSON.parse(readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8'));
  const version: unknown =
    typeof manifest === 'object' && manifest !== null ? Reflect.get(manifest, 'version') : undefined;
  if (typeof version !== 'string') throw new TypeError('package.json does not declare a version');
  return version;
}
// endregion | Helpers
