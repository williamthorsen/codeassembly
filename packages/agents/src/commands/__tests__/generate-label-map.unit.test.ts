import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { captureError } from '@williamthorsen/toolbelt.testing/candidate';
import { ProcessExitError, silenceConsole, throwOnProcessExit } from '@williamthorsen/toolbelt.vitest/candidate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { generateLabelMap, printGenerateUsage } from '../generate-label-map.ts';
import { installFixturePackage } from '../test-utils/install-fixture-package.ts';

const CHANGE_GRAMMAR_VERSION = '7.8.9';

interface LabelMap {
  readonly $schema: string;
  readonly types: Record<string, string>;
  readonly scopes: Record<string, string>;
}

/** Parses the generated JSON file content into a typed `LabelMap`. */
function parseLabelMap(raw: string): LabelMap {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- JSON.parse returns `any`; validated by test assertions
  return JSON.parse(raw);
}

describe(generateLabelMap, () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(tmpdir(), `agents-test-generate-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(tempDir, { recursive: true });
    await installFixturePackage(tempDir, '@williamthorsen/release-kit', '13.0.0');
    await installFixturePackage(tempDir, '@williamthorsen/change-grammar', CHANGE_GRAMMAR_VERSION);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('creates .meta/label-map.json with correct structure', async () => {
    const result = await readGeneratedFile({ force: false }, tempDir);
    const parsed = parseLabelMap(result);

    expect(parsed.$schema).toMatch(
      /^https:\/\/github\.com\/williamthorsen\/node-monorepo-tools\/raw\/change-grammar-v[\d.]+\/packages\/change-grammar\/schemas\/label-map\.json$/,
    );
    expect(parsed.types).toBeDefined();
    expect(parsed.scopes).toEqual({});
  });

  it("embeds the change-grammar version that the project's release-kit resolves in the $schema URL", async () => {
    const result = await readGeneratedFile({ force: false }, tempDir);
    const parsed = parseLabelMap(result);

    expect(parsed.$schema).toContain(`change-grammar-v${CHANGE_GRAMMAR_VERSION}`);
  });

  it('throws an error naming release-kit when the project does not install it', async () => {
    await rm(path.join(tempDir, 'node_modules'), { recursive: true, force: true });

    await expect(readGeneratedFile({ force: false }, tempDir)).rejects.toThrow('@williamthorsen/release-kit');
  });

  it('includes all canonical type mappings', async () => {
    const result = await readGeneratedFile({ force: false }, tempDir);
    const parsed = parseLabelMap(result);

    expect(parsed.types).toEqual({
      ai: 'ai',
      ci: 'ci',
      deprecate: 'deprecation',
      deps: 'dependencies',
      docs: 'documentation',
      drop: 'removal',
      feat: 'feature',
      fix: 'fix',
      fmt: 'formatting',
      internal: 'internal',
      perf: 'performance',
      refactor: 'refactoring',
      sec: 'security',
      tests: 'tests',
      tooling: 'tooling',
    });
  });

  it('derives scopes from packages/ subdirectories', async () => {
    await mkdir(path.join(tempDir, 'packages', 'alpha'), { recursive: true });
    await mkdir(path.join(tempDir, 'packages', 'beta'), { recursive: true });

    const result = await readGeneratedFile({ force: false }, tempDir);
    const parsed = parseLabelMap(result);

    expect(parsed.scopes).toEqual({
      alpha: 'scope:alpha',
      beta: 'scope:beta',
      root: 'scope:root',
    });
  });

  it('returns empty scopes when packages/ does not exist', async () => {
    const result = await readGeneratedFile({ force: false }, tempDir);
    const parsed = parseLabelMap(result);

    expect(parsed.scopes).toEqual({});
  });

  it("returns empty scopes when packages/ doesn't have any subdirectories", async () => {
    await mkdir(path.join(tempDir, 'packages'), { recursive: true });
    await writeFile(path.join(tempDir, 'packages', 'README.md'), 'hello', 'utf8');

    const result = await readGeneratedFile({ force: false }, tempDir);
    const parsed = parseLabelMap(result);

    expect(parsed.scopes).toEqual({});
  });

  it('exits with error when file exists and --force is not set', async () => {
    const metaDir = path.join(tempDir, '.meta');
    await mkdir(metaDir, { recursive: true });
    await writeFile(path.join(metaDir, 'label-map.json'), '{}', 'utf8');

    using _exit = throwOnProcessExit();
    using silent = silenceConsole(['error']);

    const error = await captureError(ProcessExitError, () => generateLabelMap({ force: false }, tempDir));

    expect(error.code).toBe(1);
    expect(silent.error).toHaveBeenCalledWith(expect.stringContaining('already exists'));
  });

  it('overwrites existing file when --force is set', async () => {
    const metaDir = path.join(tempDir, '.meta');
    await mkdir(metaDir, { recursive: true });
    await writeFile(path.join(metaDir, 'label-map.json'), '{"old": true}', 'utf8');

    const result = await readGeneratedFile({ force: true }, tempDir);
    const parsed = parseLabelMap(result);

    expect(parsed).toHaveProperty('types');
    expect(parsed).not.toHaveProperty('old');
  });

  it('prints the output path on success', async () => {
    using silent = silenceConsole(['info']);

    await generateLabelMap({ force: false }, tempDir);

    const expectedPath = path.join(tempDir, '.meta', 'label-map.json');
    expect(silent.info).toHaveBeenCalledWith(expectedPath);
  });
});

describe(printGenerateUsage, () => {
  it('outputs available targets and options', () => {
    using silent = silenceConsole(['info']);

    printGenerateUsage();

    expect(silent.info).toHaveBeenCalledWith(expect.stringContaining('label-map'));
    expect(silent.info).toHaveBeenCalledWith(expect.stringContaining('--force'));
  });
});

/** Runs the generator and returns the file contents. */
async function readGeneratedFile(options: { force: boolean }, workingDir: string): Promise<string> {
  using _silent = silenceConsole(['info']);
  await generateLabelMap(options, workingDir);
  return await readFile(path.join(workingDir, '.meta', 'label-map.json'), 'utf8');
}
