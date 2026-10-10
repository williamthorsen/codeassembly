import { mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { CANONICAL_TAXONOMY, deriveLabelMap } from '@williamthorsen/change-grammar';
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

  it("finds change-grammar beside release-kit's real directory under a pnpm layout", async () => {
    await rm(path.join(tempDir, 'node_modules'), { recursive: true, force: true });
    const storeModules = path.join(tempDir, 'node_modules', '.pnpm', 'release-kit@13.0.0', 'node_modules');
    await installFixturePackage(path.dirname(storeModules), '@williamthorsen/release-kit', '13.0.0');
    await installFixturePackage(path.dirname(storeModules), '@williamthorsen/change-grammar', '0.2.0');
    await mkdir(path.join(tempDir, 'node_modules', '@williamthorsen'), { recursive: true });
    await symlink(
      path.join(storeModules, '@williamthorsen', 'release-kit'),
      path.join(tempDir, 'node_modules', '@williamthorsen', 'release-kit'),
    );

    const parsed = parseLabelMap(await readGeneratedFile({ force: false }, tempDir));

    expect(parsed.$schema).toContain('change-grammar-v0.2.0');
  });

  it('throws an error naming release-kit when the project does not install it', async () => {
    await rm(path.join(tempDir, 'node_modules'), { recursive: true, force: true });

    await expect(readGeneratedFile({ force: false }, tempDir)).rejects.toThrow('@williamthorsen/release-kit');
  });

  it("takes the type labels from change-grammar's canonical taxonomy", async () => {
    const result = await readGeneratedFile({ force: false }, tempDir);
    const parsed = parseLabelMap(result);

    expect(parsed.types).toStrictEqual(deriveLabelMap(CANONICAL_TAXONOMY, []).types);
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

  describe('with pnpm-workspace.yaml', () => {
    it('derives scopes from every directory that the globs match', async () => {
      await writeWorkspaceManifest(tempDir, ['apps/*', 'packages/*']);
      await createWorkspace(tempDir, 'apps/web');
      await createWorkspace(tempDir, 'packages/core');

      const parsed = parseLabelMap(await readGeneratedFile({ force: false }, tempDir));

      expect(parsed.scopes).toEqual({ core: 'scope:core', root: 'scope:root', web: 'scope:web' });
    });

    it('omits the workspaces that a `!` pattern excludes', async () => {
      await writeWorkspaceManifest(tempDir, ['packages/*', '!packages/legacy']);
      await createWorkspace(tempDir, 'packages/core');
      await createWorkspace(tempDir, 'packages/legacy');

      const parsed = parseLabelMap(await readGeneratedFile({ force: false }, tempDir));

      expect(parsed.scopes).toEqual({ core: 'scope:core', root: 'scope:root' });
    });

    it('produces the same label map as the packages/ listing when only packages/* is declared', async () => {
      await createWorkspace(tempDir, 'packages/alpha');
      await createWorkspace(tempDir, 'packages/beta');
      const withoutManifest = await readGeneratedFile({ force: false }, tempDir);

      await writeWorkspaceManifest(tempDir, ['packages/*']);
      const withManifest = await readGeneratedFile({ force: true }, tempDir);

      expect(withManifest).toBe(withoutManifest);
    });

    it('skips a matched directory that does not contain a package.json', async () => {
      await writeWorkspaceManifest(tempDir, ['packages/*']);
      await createWorkspace(tempDir, 'packages/core');
      await mkdir(path.join(tempDir, 'packages', 'notes'), { recursive: true });

      const parsed = parseLabelMap(await readGeneratedFile({ force: false }, tempDir));

      expect(parsed.scopes).toEqual({ core: 'scope:core', root: 'scope:root' });
    });

    it('produces one scope for workspaces that share a directory name', async () => {
      await writeWorkspaceManifest(tempDir, ['apps/*', 'packages/*']);
      await createWorkspace(tempDir, 'apps/web');
      await createWorkspace(tempDir, 'packages/web');

      const parsed = parseLabelMap(await readGeneratedFile({ force: false }, tempDir));

      expect(parsed.scopes).toEqual({ root: 'scope:root', web: 'scope:web' });
    });

    it('does not list the workspace root as a scope', async () => {
      await writeWorkspaceManifest(tempDir, ['.', 'packages/*']);
      await writeFile(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'monorepo' }), 'utf8');
      await createWorkspace(tempDir, 'packages/core');

      const parsed = parseLabelMap(await readGeneratedFile({ force: false }, tempDir));

      expect(parsed.scopes).toEqual({ core: 'scope:core', root: 'scope:root' });
    });

    it('falls back to the packages/ listing when the manifest does not declare a packages list', async () => {
      await writeFile(path.join(tempDir, 'pnpm-workspace.yaml'), 'catalog:\n  zod: 4.0.0\n', 'utf8');
      await mkdir(path.join(tempDir, 'packages', 'alpha'), { recursive: true });

      const parsed = parseLabelMap(await readGeneratedFile({ force: false }, tempDir));

      expect(parsed.scopes).toEqual({ alpha: 'scope:alpha', root: 'scope:root' });
    });

    it('exits with an error naming the cause and the patterns, without writing the file, when the globs match no workspace', async () => {
      await writeWorkspaceManifest(tempDir, ['apps/*']);

      using _exit = throwOnProcessExit();
      using silent = silenceConsole(['error']);

      const error = await captureError(ProcessExitError, () => generateLabelMap({ force: false }, tempDir));

      expect(error.code).toBe(1);
      expect(silent.error).toHaveBeenCalledWith(
        expect.stringContaining('no matched directory contains a package.json'),
      );
      expect(silent.error).toHaveBeenCalledWith(expect.stringContaining('`apps/*`'));
      await expect(readFile(path.join(tempDir, '.meta', 'label-map.json'), 'utf8')).rejects.toThrow('ENOENT');
    });
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

// region | Helpers

/** Creates a workspace at `relativeDir` under `rootDir`, with a minimal `package.json`. */
async function createWorkspace(rootDir: string, relativeDir: string): Promise<void> {
  const workspaceDir = path.join(rootDir, relativeDir);
  await mkdir(workspaceDir, { recursive: true });
  await writeFile(
    path.join(workspaceDir, 'package.json'),
    JSON.stringify({ name: path.basename(workspaceDir) }),
    'utf8',
  );
}

/** Runs the generator and returns the file contents. */
async function readGeneratedFile(options: { force: boolean }, workingDir: string): Promise<string> {
  using _silent = silenceConsole(['info']);
  await generateLabelMap(options, workingDir);
  return await readFile(path.join(workingDir, '.meta', 'label-map.json'), 'utf8');
}

/** Writes a `pnpm-workspace.yaml` declaring `patterns` to `rootDir`. */
async function writeWorkspaceManifest(rootDir: string, patterns: readonly string[]): Promise<void> {
  const lines = patterns.map((pattern) => `  - '${pattern}'`);
  await writeFile(path.join(rootDir, 'pnpm-workspace.yaml'), ['packages:', ...lines, ''].join('\n'), 'utf8');
}

// endregion | Helpers
