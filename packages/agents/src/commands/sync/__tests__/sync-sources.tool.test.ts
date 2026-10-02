import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { NoContentSourceError } from '../../../lib/declared-sources.ts';
import { getHomeProvenancePath } from '../../../lib/home-provenance.ts';
import type { InstallOptions } from '../../../lib/types.ts';
import {
  declareFixtureSource,
  FIXTURE_SOURCE_NAME,
  writeFixtureDeclaration,
} from '../../test-utils/declare-fixture-source.ts';
import { syncCommand, syncGlobalCommand } from '../sync.ts';
import { SyncValidationError } from '../sync-validation-error.ts';
import { renderReportText } from '../test-utils/render-report-text.ts';

// Syncs a project that draws artifacts from a declared source alongside a lower-precedence library source, to catch
// failures that only show up when composing two sources end-to-end.
describe('sync with a declared source over the library source', () => {
  let projectRoot: string;
  let sourceDir: string;
  let libraryDir: string;
  // Because targeting reads the home tier's declaration and detects installed harnesses under it, every run below
  // is given a temp home rather than the developer's own.
  let homeDir: string;

  beforeEach(async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    homeDir = path.join(tmpdir(), `agents-test-sync-sources-int-home-${stamp}`);
    projectRoot = path.join(tmpdir(), `agents-test-sync-sources-int-proj-${stamp}`);
    sourceDir = path.join(tmpdir(), `agents-test-sync-sources-int-src-${stamp}`);
    libraryDir = path.join(tmpdir(), `agents-test-sync-sources-int-lib-${stamp}`);
    await mkdir(homeDir, { recursive: true });
    await mkdir(path.join(projectRoot, '.agents'), { recursive: true });
    await mkdir(path.join(sourceDir, 'guidance', 'rulebooks'), { recursive: true });
    await mkdir(path.join(libraryDir, 'guidance', 'rulebooks'), { recursive: true });
    await writeFile(
      path.join(libraryDir, 'guidance', 'rulebooks', 'library-rules.md'),
      '---\nslug: library-rules\ndelivery: skill\n---\n\n# Library rules\n\nLibrary-provided guidance.\n',
      'utf8',
    );
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
    await rm(homeDir, { recursive: true, force: true });
    await rm(sourceDir, { recursive: true, force: true });
    await rm(libraryDir, { recursive: true, force: true });
  });

  function makeOptions(overrides: Partial<InstallOptions> = {}): InstallOptions {
    return { harness: 'claude', link: false, force: false, dryRun: false, ...overrides };
  }

  /** Declares the library fixture as the lowest-precedence source and `org` above it, followed by `body`. */
  async function declare(body: string): Promise<void> {
    await declareFixtureSource(projectRoot, libraryDir, `sources:\n  - name: org\n    path: ${sourceDir}\n${body}`);
  }

  const localHostPath = (): string => path.join(projectRoot, 'CLAUDE.local.md');
  const skillPath = (slug: string): string => path.join(projectRoot, '.claude', 'skills', slug, 'SKILL.md');
  const subagentPath = (slug: string): string => path.join(projectRoot, '.claude', 'agents', `${slug}.md`);

  it('deploys a source ambient rulebook and a library rulebook together, then retracts the source one', async () => {
    await writeFile(
      path.join(sourceDir, 'guidance', 'rulebooks', 'org-rules.md'),
      '---\nslug: org-rules\ndelivery: ambient\n---\n\n# Org rules\n\nSource-provided guidance.\n',
      'utf8',
    );
    await declare('rulebooks:\n  use:\n    - org-rules\n    - library-rules\n');

    await syncCommand(makeOptions(), projectRoot, homeDir);

    const localHost = await readFile(localHostPath(), 'utf8');
    expect(localHost).toContain('<!-- rulebook:org-rules -->');
    expect(localHost).toContain('Source-provided guidance.');
    expect(await readFile(skillPath('consult-library-rules'), 'utf8')).toContain('# Library rules');

    await declare('rulebooks:\n  use:\n    - library-rules\n');
    await syncCommand(makeOptions(), projectRoot, homeDir);

    expect(await readFile(localHostPath(), 'utf8')).not.toContain('<!-- rulebook:org-rules -->');
    expect(existsSync(skillPath('consult-library-rules'))).toBe(true);
  });

  it('deploys a source skill and source subagent (expanding a source-local include), then retracts them', async () => {
    await mkdir(path.join(sourceDir, 'skills', 'org-skill', '_partials'), { recursive: true });
    await writeFile(
      path.join(sourceDir, 'skills', 'org-skill', '_partials', 'frag.md'),
      'Shared org fragment.\n',
      'utf8',
    );
    await writeFile(
      path.join(sourceDir, 'skills', 'org-skill', 'SKILL.md'),
      '---\nname: org-skill\n---\n\n# Org skill\n\n<!-- include: _partials/frag.md / -->\n',
      'utf8',
    );
    await mkdir(path.join(sourceDir, 'subagents'), { recursive: true });
    await writeFile(
      path.join(sourceDir, 'subagents', 'org-agent.md'),
      '---\nname: org-agent\ndescription: Org agent\n---\n\n# Org agent\n\nOrg-provided agent.\n',
      'utf8',
    );
    await declare('skills:\n  use:\n    - org-skill\nsubagents:\n  use:\n    - org-agent\n');

    await syncCommand(makeOptions(), projectRoot, homeDir);

    const skillMd = await readFile(skillPath('org-skill'), 'utf8');
    expect(skillMd).toContain('<!-- codeassembly-skill:org-skill -->');
    // The include resolves against the source root, proving the source-local partial is expanded.
    expect(skillMd).toContain('Shared org fragment.');
    expect(await readFile(subagentPath('org-agent'), 'utf8')).toContain('<!-- codeassembly-subagent:org-agent -->');

    await declare('skills:\n  use: []\nsubagents:\n  use: []\n');
    await syncCommand(makeOptions(), projectRoot, homeDir);

    expect(existsSync(skillPath('org-skill'))).toBe(false);
    expect(existsSync(subagentPath('org-agent'))).toBe(false);
  });

  it('deploys a source-declared collection, resolving members across the source and the library, then retracts', async () => {
    await mkdir(path.join(sourceDir, 'skills', 'org-skill'), { recursive: true });
    await writeFile(
      path.join(sourceDir, 'skills', 'org-skill', 'SKILL.md'),
      '---\nname: org-skill\n---\n\n# Org skill\n\nOrg-provided skill.\n',
      'utf8',
    );
    await mkdir(path.join(sourceDir, 'collections'), { recursive: true });
    await writeFile(
      path.join(sourceDir, 'collections', 'org-bundle.md'),
      '---\nname: org-bundle\nmembers:\n  rulebooks:\n    - library-rules\n  skills:\n    - org-skill\n---\n\n# Org bundle\n',
      'utf8',
    );
    await declare('collections:\n  use:\n    - org-bundle\n');

    await syncCommand(makeOptions(), projectRoot, homeDir);

    // A source collection is traversal-only: Its members deploy (the source skill and the library rulebook)
    // while the collection itself is never emitted.
    expect(await readFile(skillPath('org-skill'), 'utf8')).toContain('Org-provided skill.');
    expect(await readFile(skillPath('consult-library-rules'), 'utf8')).toContain('# Library rules');

    await declare('collections:\n  use: []\n');
    await syncCommand(makeOptions(), projectRoot, homeDir);

    expect(existsSync(skillPath('org-skill'))).toBe(false);
    expect(existsSync(skillPath('consult-library-rules'))).toBe(false);
  });
});

// Syncs declarations that leave the run without any readable source, and declarations whose sources compete for the
// same artifact, to pin what a run resolves from and what it refuses before writing.
describe('sync source resolution', () => {
  let homeDir: string;
  let projectRoot: string;
  let libraryDir: string;
  let lowDir: string;
  let highDir: string;

  beforeEach(async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    homeDir = path.join(tmpdir(), `agents-test-sync-resolution-home-${stamp}`);
    projectRoot = path.join(tmpdir(), `agents-test-sync-resolution-proj-${stamp}`);
    libraryDir = path.join(tmpdir(), `agents-test-sync-resolution-lib-${stamp}`);
    lowDir = path.join(tmpdir(), `agents-test-sync-resolution-low-${stamp}`);
    highDir = path.join(tmpdir(), `agents-test-sync-resolution-high-${stamp}`);
    await mkdir(homeDir, { recursive: true });
    await mkdir(path.join(projectRoot, '.agents'), { recursive: true });
    await writeRulebook(libraryDir, 'library-rules', 'Library-provided guidance.');
  });

  afterEach(async () => {
    for (const dir of [homeDir, projectRoot, libraryDir, lowDir, highDir]) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  function makeOptions(overrides: Partial<InstallOptions> = {}): InstallOptions {
    return { harness: 'claude', link: false, force: false, dryRun: false, ...overrides };
  }

  describe('a project declaration without a readable source', () => {
    const projectDeclarationPath = (): string => path.join(projectRoot, '.agents', 'codeassembly.yaml');

    /** Asserts that the project run left every path that a sync writes absent. */
    function expectNothingWrittenToProject(): void {
      expect(existsSync(path.join(projectRoot, '.claude'))).toBe(false);
      expect(existsSync(path.join(projectRoot, 'CLAUDE.local.md'))).toBe(false);
      expect(existsSync(path.join(projectRoot, '.agents', 'rulebooks'))).toBe(false);
    }

    for (const dryRun of [false, true]) {
      it(`stops with NoContentSourceError naming the project declaration when it declares no source (dryRun: ${dryRun})`, async () => {
        await writeFile(projectDeclarationPath(), 'rulebooks:\n  use:\n    - library-rules\n', 'utf8');

        const error = await captureError(syncCommand(makeOptions({ dryRun }), projectRoot, homeDir));

        expect(error).toBeInstanceOf(NoContentSourceError);
        expect(error.message).toContain('No content source is declared.');
        expect(error.message).toContain(projectDeclarationPath());
        expectNothingWrittenToProject();
      });

      it(`stops with NoContentSourceError when every declared source's directory is missing (dryRun: ${dryRun})`, async () => {
        const missingDir = path.join(projectRoot, 'missing-content');
        await declareFixtureSource(projectRoot, missingDir, 'rulebooks:\n  use:\n    - library-rules\n');

        const error = await captureError(syncCommand(makeOptions({ dryRun }), projectRoot, homeDir));

        expect(error).toBeInstanceOf(NoContentSourceError);
        expect(error.message).toContain(
          `None of the declared content sources exists: "${FIXTURE_SOURCE_NAME}" (${missingDir}).`,
        );
        expect(error.message).toContain(projectDeclarationPath());
        expectNothingWrittenToProject();
      });
    }
  });

  describe('a home declaration without a readable source', () => {
    const homeDeclarationPath = (): string => path.join(homeDir, '.agents', 'codeassembly.yaml');
    const homeLocalDeclarationPath = (): string => path.join(homeDir, '.agents', 'codeassembly.local.yaml');

    /** Asserts that the home run left the harness dir and the provenance stamp absent. */
    function expectNothingWrittenToHome(): void {
      expect(existsSync(path.join(homeDir, '.claude'))).toBe(false);
      expect(existsSync(path.join(homeDir, '.agents', 'rulebooks'))).toBe(false);
      // A failed attempt would be recorded in the provenance stamp; a refusal for want of a source records nothing.
      expect(existsSync(getHomeProvenancePath(homeDir))).toBe(false);
    }

    for (const dryRun of [false, true]) {
      it(`stops with NoContentSourceError naming both home declaration files when they declare no source (dryRun: ${dryRun})`, async () => {
        await mkdir(path.dirname(homeDeclarationPath()), { recursive: true });
        await writeFile(homeDeclarationPath(), 'rulebooks:\n  use:\n    - library-rules\n', 'utf8');

        const error = await captureError(syncGlobalCommand(makeOptions({ dryRun }), homeDir));

        expect(error).toBeInstanceOf(NoContentSourceError);
        expect(error.message).toContain('No content source is declared.');
        expect(error.message).toContain(homeDeclarationPath());
        expect(error.message).toContain(homeLocalDeclarationPath());
        expectNothingWrittenToHome();
      });

      it(`stops with NoContentSourceError when every home source's directory is missing (dryRun: ${dryRun})`, async () => {
        const missingDir = path.join(homeDir, 'missing-content');
        await mkdir(path.dirname(homeDeclarationPath()), { recursive: true });
        await writeFile(homeDeclarationPath(), 'rulebooks:\n  use:\n    - library-rules\n', 'utf8');
        await writeFixtureDeclaration(homeLocalDeclarationPath(), missingDir);

        const error = await captureError(syncGlobalCommand(makeOptions({ dryRun }), homeDir));

        expect(error).toBeInstanceOf(NoContentSourceError);
        expect(error.message).toContain(
          `None of the declared content sources exists: "${FIXTURE_SOURCE_NAME}" (${missingDir}).`,
        );
        expect(error.message).toContain(homeDeclarationPath());
        expect(error.message).toContain(homeLocalDeclarationPath());
        expectNothingWrittenToHome();
      });
    }
  });

  describe('a shadow between two declared sources', () => {
    beforeEach(async () => {
      await writeRulebook(lowDir, 'shared-rules', 'Low-precedence guidance.');
      await writeRulebook(highDir, 'shared-rules', 'High-precedence guidance.');
      // A later `sources:` entry outranks an earlier one, so `high` wins the slug that both ship.
      await declareFixtureSource(
        projectRoot,
        libraryDir,
        `sources:\n  - name: low\n    path: ${lowDir}\n  - name: high\n    path: ${highDir}\n` +
          'rulebooks:\n  use:\n    - shared-rules\n',
      );
    });

    it('names the shadowed source in the dry-run resolution line', async () => {
      const outcome = await syncCommand(makeOptions({ dryRun: true }), projectRoot, homeDir);

      const text = renderReportText(outcome, { dryRun: true });
      expect(text).toMatch(/ {2}rulebook {2}shared-rules {2}← source "high" \(shadows source "low"\)$/m);
    });

    it('warns on a real run, naming the winning and the shadowed source, and deploys the winner', async () => {
      const outcome = await syncCommand(makeOptions(), projectRoot, homeDir);

      expect(renderReportText(outcome, { level: 'warn' })).toContain(
        '[warning] 1 artifact shadows a lower-precedence source: rulebook "shared-rules" (source "high" over source "low")',
      );
      const deployed = await readFile(
        path.join(projectRoot, '.claude', 'skills', 'consult-shared-rules', 'SKILL.md'),
        'utf8',
      );
      expect(deployed).toContain('High-precedence guidance.');
      expect(deployed).not.toContain('Low-precedence guidance.');
    });
  });

  describe('a project sync beside a home declaration that declares sources', () => {
    beforeEach(async () => {
      // The home chain declares the library; nothing in the project chain does.
      await declareFixtureSource(homeDir, libraryDir);
    });

    it('stops with NoContentSourceError when the project chain declares no source of its own', async () => {
      await writeFile(
        path.join(projectRoot, '.agents', 'codeassembly.yaml'),
        'rulebooks:\n  use:\n    - library-rules\n',
        'utf8',
      );

      const error = await captureError(syncCommand(makeOptions(), projectRoot, homeDir));

      expect(error).toBeInstanceOf(NoContentSourceError);
      expect(existsSync(path.join(projectRoot, '.claude'))).toBe(false);
    });

    it('does not resolve an artifact shipped only by a home-chain source', async () => {
      await writeRulebook(lowDir, 'org-rules', 'Org guidance.');
      await writeFile(
        path.join(projectRoot, '.agents', 'codeassembly.yaml'),
        `sources:\n  - name: org\n    path: ${lowDir}\nrulebooks:\n  use:\n    - library-rules\n`,
        'utf8',
      );

      const error = await captureError(syncCommand(makeOptions(), projectRoot, homeDir));

      expect(error).toBeInstanceOf(SyncValidationError);
      expect(error.message).toContain('declares rulebook "library-rules", which was not found in any of:');
      expect(error.message).toContain(path.join(lowDir, 'guidance', 'rulebooks', 'library-rules.md'));
      expect(error.message).not.toContain(libraryDir);
      expect(existsSync(path.join(projectRoot, '.claude'))).toBe(false);
    });
  });
});

// region | Helpers

/** Awaits `promise` and returns the error that it rejects with, failing the test if it resolves. */
async function captureError(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error: unknown) {
    if (error instanceof Error) {
      return error;
    }
    throw new Error(`Expected an Error rejection, received ${String(error)}`, { cause: error });
  }
  throw new Error('Expected the promise to reject');
}

/** Writes a `skill`-delivered rulebook whose body contains `text` under `contentDir`. */
async function writeRulebook(contentDir: string, slug: string, text: string): Promise<void> {
  await mkdir(path.join(contentDir, 'guidance', 'rulebooks'), { recursive: true });
  await writeFile(
    path.join(contentDir, 'guidance', 'rulebooks', `${slug}.md`),
    `---\nslug: ${slug}\ndelivery: skill\n---\n\n# ${slug}\n\n${text}\n`,
    'utf8',
  );
}

// endregion | Helpers
