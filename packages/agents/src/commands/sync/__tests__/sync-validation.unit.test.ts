import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ContentDefect } from '../../../lib/content-defects.ts';
import type { InstallOptions } from '../../../lib/types.ts';
import { syncCommand } from '../sync.ts';
import { isSyncValidationError } from '../sync-validation-error.ts';

describe('syncCommand pre-write validation', () => {
  let projectRoot: string;
  let contentDir: string;
  // Targeting reads the home tier's declaration and detects installed harnesses under it, so every run below is
  // given a temp home rather than the developer's own.
  let homeDir: string;

  beforeEach(async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    homeDir = path.join(tmpdir(), `agents-test-sync-validation-home-${stamp}`);
    projectRoot = path.join(tmpdir(), `agents-test-sync-validation-proj-${stamp}`);
    contentDir = path.join(tmpdir(), `agents-test-sync-validation-content-${stamp}`);
    await mkdir(homeDir, { recursive: true });
    await mkdir(path.join(projectRoot, '.agents'), { recursive: true });
    await mkdir(contentDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
    await rm(homeDir, { recursive: true, force: true });
    await rm(contentDir, { recursive: true, force: true });
  });

  it('reports every rulebook whose frontmatter is invalid, not only the first', async () => {
    await writeLibraryRulebook(contentDir, 'alpha', 'version: 1');
    await writeLibraryRulebook(contentDir, 'beta', 'version: 2');
    await writeLibraryRulebook(contentDir, 'gamma', 'version: 3');
    await declareRulebooks(projectRoot, 'alpha', 'beta', 'gamma');

    const defects = await collectDefects(projectRoot, contentDir, homeDir);

    expect(defects.map((defect) => defect.file)).toEqual([
      'guidance/rulebooks/alpha.md',
      'guidance/rulebooks/beta.md',
      'guidance/rulebooks/gamma.md',
    ]);
    expect(defects.every((defect) => defect.kind === 'resolution')).toBe(true);
    expect(defects[0]?.detail).toMatch(/version must be quoted/);
  });

  it('writes nothing when validation fails', async () => {
    await writeLibraryRulebook(contentDir, 'alpha', 'version: 1');
    await declareRulebooks(projectRoot, 'alpha');

    await collectDefects(projectRoot, contentDir, homeDir);

    expect(existsSync(path.join(projectRoot, '.claude'))).toBe(false);
    expect(existsSync(path.join(projectRoot, 'CLAUDE.local.md'))).toBe(false);
  });

  it('reports defects raised by different gates in one run', async () => {
    await writeLibraryRulebook(contentDir, 'alpha', 'version: 1');
    await writeLibrarySkill(contentDir, 'people-report');
    await declareRaw(
      projectRoot,
      'rulebooks:\n  use:\n    - alpha\nskills:\n  use:\n    - people-report\n    - ghost\n',
    );

    const defects = await collectDefects(projectRoot, contentDir, homeDir);

    expect(defects.map((defect) => defect.file).toSorted()).toEqual([
      'guidance/rulebooks/alpha.md',
      'skills/ghost/SKILL.md',
    ]);
  });

  it('reports a declared artifact that resolves from nowhere just once', async () => {
    await declareRulebooks(projectRoot, 'ghost');

    const defects = await collectDefects(projectRoot, contentDir, homeDir);

    expect(defects).toHaveLength(1);
    expect(defects[0]?.detail).toMatch(/declares rulebook "ghost", which was not found/);
  });

  it('leaves a valid declaration untouched by the collecting gates', async () => {
    await writeLibraryRulebook(contentDir, 'alpha', "version: '1'");
    await declareRulebooks(projectRoot, 'alpha');

    await syncCommand(makeOptions(), projectRoot, contentDir, homeDir);

    expect(existsSync(path.join(projectRoot, 'CLAUDE.local.md'))).toBe(true);
  });
});

// region | Helpers

/** Runs a sync expected to fail validation and returns the defects the aggregate carries. */
async function collectDefects(
  projectRoot: string,
  contentDir: string,
  homeDir: string,
): Promise<ReadonlyArray<ContentDefect>> {
  const raised: unknown = await syncCommand(makeOptions(), projectRoot, contentDir, homeDir).catch(
    (error: unknown) => error,
  );
  if (!isSyncValidationError(raised)) {
    throw new Error(`Expected a SyncValidationError, got: ${String(raised)}`);
  }
  return raised.defects;
}

/** Writes the project-scope declaration verbatim. */
async function declareRaw(projectRoot: string, body: string): Promise<void> {
  await writeFile(path.join(projectRoot, '.agents', 'codeassembly.yaml'), body, 'utf8');
}

/** Declares the given rulebook slugs in the project-scope codeassembly.yaml. */
async function declareRulebooks(projectRoot: string, ...slugs: ReadonlyArray<string>): Promise<void> {
  await declareRaw(projectRoot, `rulebooks:\n  use:\n${slugs.map((slug) => `    - ${slug}`).join('\n')}\n`);
}

/** Build sync options targeting only the Claude harness. */
function makeOptions(): InstallOptions {
  return { harness: 'claude', link: false, force: false, dryRun: false };
}

/** Writes a fixture ambient rulebook into the temp content library, with the given extra frontmatter line. */
async function writeLibraryRulebook(contentDir: string, slug: string, frontmatterLine: string): Promise<void> {
  const dir = path.join(contentDir, 'guidance', 'rulebooks');
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, `${slug}.md`),
    `---\nslug: ${slug}\ndelivery: ambient\n${frontmatterLine}\n---\n\n# ${slug}\n\nGuidance.\n`,
    'utf8',
  );
}

/** Writes a fixture skill into the temp content library's `skills/<slug>/SKILL.md`. */
async function writeLibrarySkill(contentDir: string, slug: string): Promise<void> {
  const dir = path.join(contentDir, 'skills', slug);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'SKILL.md'), `---\nname: ${slug}\n---\n\n# ${slug}\n`, 'utf8');
}

// endregion | Helpers
