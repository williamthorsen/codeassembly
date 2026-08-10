import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { generateLabelMap, printGenerateUsage, readReleaseKitVersion } from '../generate-label-map.ts';

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
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('creates .meta/label-map.json with correct structure', async () => {
    const result = await readGeneratedFile({ force: false }, tempDir);
    const parsed = parseLabelMap(result);

    expect(parsed.$schema).toMatch(
      /^https:\/\/github\.com\/williamthorsen\/node-monorepo-tools\/raw\/release-kit-v[\d.]+\/packages\/release-kit\/schemas\/label-map\.json$/,
    );
    expect(parsed.types).toBeDefined();
    expect(parsed.scopes).toEqual({});
  });

  it('embeds the installed release-kit version in the $schema URL', async () => {
    const releaseKitVersion = await readReleaseKitVersion();

    const result = await readGeneratedFile({ force: false }, tempDir);
    const parsed = parseLabelMap(result);

    expect(parsed.$schema).toContain(`release-kit-v${releaseKitVersion}`);
  });

  it('includes all canonical type mappings', async () => {
    const result = await readGeneratedFile({ force: false }, tempDir);
    const parsed = parseLabelMap(result);

    expect(parsed.types).toEqual({
      ai: 'ai',
      ci: 'ci',
      deprecate: 'deprecate',
      deps: 'dependencies',
      docs: 'documentation',
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

  it('returns empty scopes when packages/ has no subdirectories', async () => {
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

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(generateLabelMap({ force: false }, tempDir)).rejects.toThrow('process.exit called');

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('already exists'));

    exitSpy.mockRestore();
    errorSpy.mockRestore();
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
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    await generateLabelMap({ force: false }, tempDir);

    const expectedPath = path.join(tempDir, '.meta', 'label-map.json');
    expect(infoSpy).toHaveBeenCalledWith(expectedPath);

    infoSpy.mockRestore();
  });
});

describe(printGenerateUsage, () => {
  it('outputs available targets and options', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    printGenerateUsage();

    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('label-map'));
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('--force'));

    infoSpy.mockRestore();
  });
});

/** Runs the generator and returns the file contents. */
async function readGeneratedFile(options: { force: boolean }, workingDir: string): Promise<string> {
  const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
  await generateLabelMap(options, workingDir);
  infoSpy.mockRestore();
  return readFile(path.join(workingDir, '.meta', 'label-map.json'), 'utf8');
}
