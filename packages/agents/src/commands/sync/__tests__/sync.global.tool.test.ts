import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { hasAmbientRegion } from '../../../lib/ambient-region.ts';
import { HARNESSES } from '../../../lib/harness.ts';
import { getHomeProvenancePath, readHomeProvenance } from '../../../lib/home-provenance.ts';
import { resolveRunningPackageRoot } from '../../../lib/running-package.ts';
import type { InstallOptions } from '../../../lib/types.ts';
import { declareFixtureSource, FIXTURE_SOURCE_NAME } from '../../test-utils/declare-fixture-source.ts';
import { syncCommand, syncGlobalCommand } from '../sync.ts';
import { isSyncValidationError } from '../sync-validation-error.ts';
import { ambientRegionNote } from '../test-utils/ambient-region-note.ts';
import { renderReportLines } from '../test-utils/render-report-lines.ts';
import { renderReportText } from '../test-utils/render-report-text.ts';

const ROVO_HOME = HARNESSES.rovo.homeDir;

describe(syncGlobalCommand, () => {
  let homeDir: string;
  let contentDir: string;

  beforeEach(async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    homeDir = path.join(tmpdir(), `agents-test-sync-home-${stamp}`);
    contentDir = path.join(tmpdir(), `agents-test-sync-home-content-${stamp}`);
    await mkdir(homeDir, { recursive: true });
    await mkdir(path.join(contentDir, 'guidance', 'rulebooks'), { recursive: true });
  });

  afterEach(async () => {
    await rm(homeDir, { recursive: true, force: true });
    await rm(contentDir, { recursive: true, force: true });
  });

  function makeOptions(overrides: Partial<InstallOptions> = {}): InstallOptions {
    return { harness: 'claude', link: false, force: false, dryRun: false, ...overrides };
  }

  /** Writes a fixture rulebook into the fixture source tree. */
  async function writeFixtureRulebook(slug: string, frontmatter: string, body: string): Promise<void> {
    const file = path.join(contentDir, 'guidance', 'rulebooks', `${slug}.md`);
    await writeFile(file, `---\nslug: ${slug}\n${frontmatter}\n---\n\n${body}\n`, 'utf8');
  }

  /** Writes a support file under the fixture source's `skills/`, at a path relative to that directory. */
  async function writeFixtureSupportFile(relPath: string): Promise<void> {
    const file = path.join(contentDir, 'skills', relPath);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, '# Support\n\n## Block\n', 'utf8');
  }

  /** Writes a fixture skill into the fixture source tree. */
  async function writeFixtureSkill(slug: string): Promise<void> {
    const dir = path.join(contentDir, 'skills', slug);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'SKILL.md'), `---\nname: ${slug}\n---\n\n# ${slug}\n\nBody.\n`, 'utf8');
  }

  /** Writes the temp home's codeassembly.yaml declaring the fixture source plus the given body. */
  async function declareRaw(content: string): Promise<void> {
    await declareFixtureSource(homeDir, contentDir, content);
  }

  /** Seeds a rendered harness guidance file containing an empty ambient region, as `install` renders it. */
  async function seedGuidanceFile(harnessDir: string, name: string): Promise<string> {
    const dir = path.join(homeDir, harnessDir);
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, name);
    await writeFile(
      file,
      '# Guidance\n\n<!-- codeassembly-ambient:start -->\n<!-- codeassembly-ambient:end -->\n',
      'utf8',
    );
    return file;
  }

  it("names the home declaration when a declared artifact doesn't resolve from any source", async () => {
    await declareRaw('skills:\n  use:\n    - ghost\n');

    await expect(syncGlobalCommand(makeOptions(), homeDir)).rejects.toThrow(
      `The home declaration (${path.join(homeDir, '.agents', 'codeassembly.yaml')}) declares skill "ghost"`,
    );
  });

  it("when ~/.agents/codeassembly.yaml doesn't exist, doesn't make any changes and points at init --global", async () => {
    const infoLines = renderReportLines(await syncGlobalCommand(makeOptions(), homeDir), { level: 'info' });

    expect(existsSync(path.join(homeDir, '.agents', 'rulebooks'))).toBe(false);
    expect(infoLines.join('\n')).toContain('init --global');
  });

  it('writes a reference under the home directory as a ~-anchored path', async () => {
    const claudeMd = await seedGuidanceFile('.claude', 'CLAUDE.md');
    await mkdir(path.join(homeDir, 'node_modules', 'ca-fixture-docs', 'docs'), { recursive: true });
    await writeFile(path.join(homeDir, 'node_modules', 'ca-fixture-docs', 'package.json'), '{}', 'utf8');
    await declareRaw(
      'references:\n  - name: fixture-docs\n    package: ca-fixture-docs\n    path: docs\n    summary: Read it.\n',
    );

    await syncGlobalCommand(makeOptions(), homeDir);

    expect(await readFile(claudeMd, 'utf8')).toContain('Location: `~/node_modules/ca-fixture-docs/docs`');
  });

  it('deploys a declared skill into the home harness skills dir with the ownership marker', async () => {
    await writeFixtureSkill('people-report');
    await declareRaw('skills:\n  use:\n    - people-report\n');

    await syncGlobalCommand(makeOptions(), homeDir);

    const skill = await readFile(path.join(homeDir, '.claude', 'skills', 'people-report', 'SKILL.md'), 'utf8');
    expect(skill).toContain('<!-- codeassembly-skill:people-report -->');
  });

  // A link to a skill deployed by the run is the one target whose anchor reads the domain base, so it is where a home
  // domain anchored anywhere but `~` would show itself. Every other target is tilde-anchored outright and would
  // survive such a change unmarked.
  it('anchors a link to a delivered skill at the harness home, where the home domain writes it', async () => {
    await writeFixtureRulebook('alpha', 'delivery: skill', 'See [beta](../../skills/consult-beta/SKILL.md).');
    await writeFixtureRulebook('beta', 'delivery: skill', 'Beta body.');
    await declareRaw('rulebooks:\n  use:\n    - alpha\n    - beta\n');

    await syncGlobalCommand(makeOptions(), homeDir);

    const skill = await readFile(path.join(homeDir, '.claude', 'skills', 'consult-alpha', 'SKILL.md'), 'utf8');
    expect(skill).toContain('[beta](~/.claude/skills/consult-beta/SKILL.md)');
  });

  it("delivers a source's support entries into its namespace under the home skills dir", async () => {
    await mkdir(path.join(contentDir, 'skills', '_data'), { recursive: true });
    await writeFile(path.join(contentDir, 'skills', '_data', 'concision.md'), '# Concision\n', 'utf8');
    await declareRaw('rulebooks:\n  use: []\n');

    await syncGlobalCommand(makeOptions(), homeDir);

    const sourcesRoot = path.join(homeDir, '.claude', 'skills', '_sources');
    expect(await readFile(path.join(sourcesRoot, FIXTURE_SOURCE_NAME, '_data', 'concision.md'), 'utf8')).toBe(
      '# Concision\n',
    );
  });

  it("resolves an inline support reference in a rulebook to the source's ~-anchored namespace", async () => {
    await writeFixtureSupportFile('_data/concision.md');
    await writeFixtureRulebook('alpha', 'delivery: skill', 'Read `{harness_home_dir}/skills/_data/concision.md`.');
    await declareRaw('rulebooks:\n  use:\n    - alpha\n');

    await syncGlobalCommand(makeOptions(), homeDir);

    const skill = await readFile(path.join(homeDir, '.claude', 'skills', 'consult-alpha', 'SKILL.md'), 'utf8');
    expect(skill).toContain(`Read \`~/.claude/skills/_sources/${FIXTURE_SOURCE_NAME}/_data/concision.md\`.`);
  });

  it("anchors a support link at the source's ~-anchored namespace in the home domain", async () => {
    await writeFixtureSupportFile('_data/concision.md');
    await writeFixtureRulebook('alpha', 'delivery: skill', 'See [concision](../../skills/_data/concision.md).');
    await declareRaw('rulebooks:\n  use:\n    - alpha\n');

    await syncGlobalCommand(makeOptions(), homeDir);

    const skill = await readFile(path.join(homeDir, '.claude', 'skills', 'consult-alpha', 'SKILL.md'), 'utf8');
    expect(skill).toContain(`[concision](~/.claude/skills/_sources/${FIXTURE_SOURCE_NAME}/_data/concision.md)`);
  });

  it('injects ambient rulebooks into the harness guidance ambient region, never GLOBAL.md or PROJECT.md', async () => {
    const claudeMd = await seedGuidanceFile('.claude', 'CLAUDE.md');
    await writeFixtureRulebook('alpha', 'delivery: ambient', 'Alpha rules.');
    await declareRaw('rulebooks:\n  use:\n    - alpha\n');

    await syncGlobalCommand(makeOptions(), homeDir);

    const content = await readFile(claudeMd, 'utf8');
    expect(content).toContain('<!-- rulebook:alpha -->');
    expect(content).toContain('Alpha rules.');
    expect(existsSync(path.join(homeDir, '.agents', 'GLOBAL.md'))).toBe(false);
    expect(existsSync(path.join(homeDir, '.agents', 'PROJECT.md'))).toBe(false);
  });

  it('retracts the harness dropped by a narrowed declaration, emptying its guidance region but keeping the markers', async () => {
    const rovoMd = await seedGuidanceFile(ROVO_HOME, HARNESSES.rovo.guidanceFileName);
    await writeFixtureRulebook('alpha', 'delivery: [ambient, skill]', 'Alpha rules.');
    await declareRaw('harnesses:\n  use:\n    - claude\n    - rovo\nrulebooks:\n  use:\n    - alpha\n');
    await syncGlobalCommand(makeOptions({ harness: 'all' }), homeDir);
    const rovoSkill = path.join(homeDir, ROVO_HOME, 'skills', 'consult-alpha', 'SKILL.md');
    expect(existsSync(rovoSkill)).toBe(true);
    expect(existsSync(path.join(homeDir, ROVO_HOME, 'prompts.yml'))).toBe(true);
    expect(await readFile(rovoMd, 'utf8')).toContain('Alpha rules.');

    await declareRaw('harnesses:\n  use:\n    - claude\nrulebooks:\n  use:\n    - alpha\n');
    await syncGlobalCommand(makeOptions({ harness: 'all' }), homeDir);

    expect(existsSync(rovoSkill)).toBe(false);
    expect(existsSync(path.join(homeDir, ROVO_HOME, 'prompts.yml'))).toBe(false);
    // `install` places the region, so retraction empties what sync wrote and leaves the file and markers.
    expect(await readFile(rovoMd, 'utf8')).toBe(
      '# Guidance\n\n<!-- codeassembly-ambient:start -->\n<!-- codeassembly-ambient:end -->\n',
    );
  });

  it('opens the harness guidance region with the generated note, directly above the first rulebook block', async () => {
    const claudeMd = await seedGuidanceFile('.claude', 'CLAUDE.md');
    await writeFixtureRulebook('alpha', 'delivery: ambient', 'Alpha rules.');
    await declareRaw('rulebooks:\n  use:\n    - alpha\n');

    await syncGlobalCommand(makeOptions(), homeDir);

    expect(await readFile(claudeMd, 'utf8')).toContain(
      `<!-- codeassembly-ambient:start -->\n${ambientRegionNote}\n<!-- rulebook:alpha -->`,
    );
  });

  it('injects the ambient region of every targeted harness guidance file', async () => {
    const claudeMd = await seedGuidanceFile('.claude', 'CLAUDE.md');
    const rovoMd = await seedGuidanceFile(ROVO_HOME, 'AGENTS.md');
    await writeFixtureRulebook('alpha', 'delivery: ambient', 'Alpha rules.');
    await declareRaw('rulebooks:\n  use:\n    - alpha\n');

    await syncGlobalCommand(makeOptions({ harness: 'all' }), homeDir);

    for (const guidanceFile of [claudeMd, rovoMd]) {
      expect(await readFile(guidanceFile, 'utf8')).toContain('<!-- rulebook:alpha -->');
    }
  });

  it('narrows to the harnesses declared by its own tier', async () => {
    const claudeMd = await seedGuidanceFile('.claude', 'CLAUDE.md');
    const rovoMd = await seedGuidanceFile(ROVO_HOME, 'AGENTS.md');
    await writeFixtureRulebook('alpha', 'delivery: ambient', 'Alpha rules.');
    await declareRaw('harnesses:\n  use:\n    - claude\nrulebooks:\n  use:\n    - alpha\n');

    await syncGlobalCommand(makeOptions({ harness: 'all' }), homeDir);

    expect(await readFile(claudeMd, 'utf8')).toContain('<!-- rulebook:alpha -->');
    expect(await readFile(rovoMd, 'utf8')).not.toContain('<!-- rulebook:alpha -->');
  });

  it('fails the run when a declared source declares an unsupported content format', async () => {
    const sourceDir = path.join(contentDir, '..', `${path.basename(contentDir)}-source`);
    await mkdir(sourceDir, { recursive: true });
    await writeFile(path.join(sourceDir, 'codeassembly-content.yaml'), 'format: 3\n', 'utf8');
    await declareRaw(`sources:\n  - name: org\n    path: ${sourceDir}\nrulebooks:\n  use: []\n`);

    try {
      await expect(syncGlobalCommand(makeOptions(), homeDir)).rejects.toThrow(/Unsupported content format.*"org".*2/s);
    } finally {
      await rm(sourceDir, { recursive: true, force: true });
    }
  });

  it('warns and skips ambient delivery when the guidance file is missing', async () => {
    await writeFixtureRulebook('alpha', 'delivery: ambient', 'Alpha rules.');
    await writeFixtureRulebook('beta', 'delivery: skill', 'Beta rules.');
    await declareRaw('rulebooks:\n  use:\n    - alpha\n    - beta\n');

    const output = renderReportText(await syncGlobalCommand(makeOptions(), homeDir), { level: 'warn' });
    expect(output).toContain('codeassembly install');

    // The skip is confined to ambient delivery: Skill delivery, which shares the run, still completes.
    expect(await readFile(path.join(homeDir, '.claude', 'skills', 'consult-beta', 'SKILL.md'), 'utf8')).toContain(
      'Beta rules.',
    );
  });

  it('warns and skips ambient delivery when the guidance file contains a damaged region', async () => {
    const dir = path.join(homeDir, '.claude');
    await mkdir(dir, { recursive: true });
    const damaged = path.join(dir, 'CLAUDE.md');
    const before = '# Guidance\n\n<!-- codeassembly-ambient:start -->\nStranded.\n';
    await writeFile(damaged, before, 'utf8');
    await writeFixtureRulebook('alpha', 'delivery: ambient', 'Alpha rules.');
    await declareRaw('rulebooks:\n  use:\n    - alpha\n');

    const output = renderReportText(await syncGlobalCommand(makeOptions(), homeDir), { level: 'warn' });
    expect(output).toContain('damaged ambient region');

    expect(await readFile(damaged, 'utf8')).toBe(before);
  });

  it("warns and skips ambient delivery when the guidance file doesn't contain a region", async () => {
    const dir = path.join(homeDir, '.claude');
    await mkdir(dir, { recursive: true });
    const regionless = path.join(dir, 'CLAUDE.md');
    await writeFile(regionless, '# Guidance without a region\n', 'utf8');
    await writeFixtureRulebook('alpha', 'delivery: ambient', 'Alpha rules.');
    await declareRaw('rulebooks:\n  use:\n    - alpha\n');

    const output = renderReportText(await syncGlobalCommand(makeOptions(), homeDir), { level: 'warn' });
    expect(output).toContain("doesn't have an ambient region");

    expect(await readFile(regionless, 'utf8')).toBe('# Guidance without a region\n');
  });

  it('previews ambient region injection in dry-run without writing', async () => {
    const claudeMd = await seedGuidanceFile('.claude', 'CLAUDE.md');
    const before = await readFile(claudeMd, 'utf8');
    await writeFixtureRulebook('alpha', 'delivery: ambient', 'Alpha rules.');
    await declareRaw('rulebooks:\n  use:\n    - alpha\n');

    const output = renderReportText(await syncGlobalCommand(makeOptions({ dryRun: true }), homeDir), {
      dryRun: true,
      level: 'info',
    });

    expect(output).toContain('inject the ambient region in');
    expect(await readFile(claudeMd, 'utf8')).toBe(before);
  });

  it('previews the ambient-delivery skip in dry-run when the guidance file is missing', async () => {
    await writeFixtureRulebook('alpha', 'delivery: ambient', 'Alpha rules.');
    await declareRaw('rulebooks:\n  use:\n    - alpha\n');

    const output = renderReportText(await syncGlobalCommand(makeOptions({ dryRun: true }), homeDir), {
      dryRun: true,
      level: 'info',
    });

    expect(output).toContain('skip ambient delivery');
    expect(output).toContain('codeassembly install');
    expect(output).not.toContain('inject the ambient region in');
  });

  it('predicts deletion in dry-run when the legacy GLOBAL.md contains only sync-owned blocks', async () => {
    await seedGuidanceFile('.claude', 'CLAUDE.md');
    await writeFixtureRulebook('alpha', 'delivery: ambient', 'Alpha rules.');
    await declareRaw('rulebooks:\n  use:\n    - alpha\n');
    const legacyPath = path.join(homeDir, '.agents', 'GLOBAL.md');
    await writeFile(legacyPath, '<!-- rulebook:alpha -->\nAlpha rules.\n<!-- /rulebook:alpha -->\n', 'utf8');

    const output = renderReportText(await syncGlobalCommand(makeOptions({ dryRun: true }), homeDir), {
      dryRun: true,
      level: 'info',
    });

    expect(output).toContain(`would delete ${legacyPath}`);
  });

  it('predicts a strip, not a deletion, when the legacy GLOBAL.md also contains hand-written content', async () => {
    await seedGuidanceFile('.claude', 'CLAUDE.md');
    await writeFixtureRulebook('alpha', 'delivery: ambient', 'Alpha rules.');
    await declareRaw('rulebooks:\n  use:\n    - alpha\n');
    const legacyPath = path.join(homeDir, '.agents', 'GLOBAL.md');
    await writeFile(legacyPath, 'Mine.\n\n<!-- rulebook:alpha -->\nAlpha rules.\n<!-- /rulebook:alpha -->\n', 'utf8');

    const output = renderReportText(await syncGlobalCommand(makeOptions({ dryRun: true }), homeDir), {
      dryRun: true,
      level: 'info',
    });

    expect(output).toContain(`retire the rulebook blocks in ${legacyPath}`);
    expect(output).not.toContain('would delete');
  });

  it('does not retire a legacy GLOBAL.md in dry-run', async () => {
    await seedGuidanceFile('.claude', 'CLAUDE.md');
    await writeFixtureRulebook('alpha', 'delivery: ambient', 'Alpha rules.');
    await declareRaw('rulebooks:\n  use:\n    - alpha\n');
    const legacyPath = path.join(homeDir, '.agents', 'GLOBAL.md');
    const legacyContent = '<!-- rulebook:alpha -->\nAlpha rules.\n<!-- /rulebook:alpha -->\n';
    await writeFile(legacyPath, legacyContent, 'utf8');

    await syncGlobalCommand(makeOptions({ dryRun: true }), homeDir);

    expect(await readFile(legacyPath, 'utf8')).toBe(legacyContent);
  });

  it('refuses to overwrite a home skill that lacks the sync ownership marker', async () => {
    await writeFixtureSkill('people-report');
    await declareRaw('skills:\n  use:\n    - people-report\n');
    const target = path.join(homeDir, '.claude', 'skills', 'people-report');
    await mkdir(target, { recursive: true });
    await writeFile(path.join(target, 'SKILL.md'), '---\nname: people-report\n---\n\n# Hand-authored\n', 'utf8');

    let raised: unknown;
    try {
      await syncGlobalCommand(makeOptions(), homeDir);
    } catch (error: unknown) {
      raised = error;
    }

    expect(isSyncValidationError(raised)).toBe(true);
    expect(isSyncValidationError(raised) && raised.defects).toEqual([
      { file: path.join(target, 'SKILL.md'), kind: 'target', detail: expect.stringMatching(/not owned by sync/i) },
    ]);
    expect(await readFile(path.join(target, 'SKILL.md'), 'utf8')).toContain('Hand-authored');
  });

  it('refuses a bare sync run rooted at the home directory, directing to --global', async () => {
    await expect(syncCommand(makeOptions(), homeDir, homeDir)).rejects.toThrow(/--global/);
  });

  it('empties the ambient region on undeclare and never writes ~/.agents/AGENTS.md', async () => {
    const claudeMd = await seedGuidanceFile('.claude', 'CLAUDE.md');
    await writeFixtureRulebook('alpha', 'delivery: ambient', 'Alpha rules.');
    await declareRaw('rulebooks:\n  use:\n    - alpha\n');
    await syncGlobalCommand(makeOptions(), homeDir);
    expect(await readFile(claudeMd, 'utf8')).toContain('<!-- rulebook:alpha -->');

    await declareRaw('rulebooks:\n  use: []\n');
    await syncGlobalCommand(makeOptions(), homeDir);

    const content = await readFile(claudeMd, 'utf8');
    expect(content).not.toContain('<!-- rulebook:alpha -->');
    expect(hasAmbientRegion(content)).toBe(true);
    expect(existsSync(path.join(homeDir, '.agents', 'AGENTS.md'))).toBe(false);
  });

  it('deletes a legacy GLOBAL.md containing only sync-owned blocks', async () => {
    await seedGuidanceFile('.claude', 'CLAUDE.md');
    await writeFixtureRulebook('alpha', 'delivery: ambient', 'Alpha rules.');
    await declareRaw('rulebooks:\n  use:\n    - alpha\n');
    const legacyPath = path.join(homeDir, '.agents', 'GLOBAL.md');
    await writeFile(legacyPath, '<!-- rulebook:alpha -->\nAlpha rules.\n<!-- /rulebook:alpha -->\n', 'utf8');

    await syncGlobalCommand(makeOptions(), homeDir);

    expect(existsSync(legacyPath)).toBe(false);
  });

  it('strips sync-owned blocks from a legacy GLOBAL.md and preserves foreign content', async () => {
    await seedGuidanceFile('.claude', 'CLAUDE.md');
    await writeFixtureRulebook('alpha', 'delivery: ambient', 'Alpha rules.');
    await declareRaw('rulebooks:\n  use:\n    - alpha\n');
    const legacyPath = path.join(homeDir, '.agents', 'GLOBAL.md');
    await writeFile(
      legacyPath,
      '# My hand-written notes\n\n<!-- rulebook:alpha -->\nAlpha rules.\n<!-- /rulebook:alpha -->\n',
      'utf8',
    );

    await syncGlobalCommand(makeOptions(), homeDir);

    const remainder = await readFile(legacyPath, 'utf8');
    expect(remainder).toContain('# My hand-written notes');
    expect(remainder).not.toContain('<!-- rulebook:alpha -->');
  });

  it('refreshes prompts.yml in the rovo home with home-deployed Rovo Dev skills through the managed region', async () => {
    await writeFixtureSkill('people-report');
    await declareRaw('skills:\n  use:\n    - people-report\n');

    await syncGlobalCommand(makeOptions({ harness: 'rovo' }), homeDir);

    const prompts = await readFile(path.join(homeDir, ROVO_HOME, 'prompts.yml'), 'utf8');
    expect(prompts).toContain('# codeassembly:managed:start');
    expect(prompts).toContain("name: 'people-report'");
    expect(prompts).toContain('content_file: skills/people-report/SKILL.md');
  });

  it('merges the home prompts.yml region into a hand-authored file, preserving foreign entries', async () => {
    await writeFixtureSkill('people-report');
    await declareRaw('skills:\n  use:\n    - people-report\n');
    await mkdir(path.join(homeDir, ROVO_HOME), { recursive: true });
    await writeFile(
      path.join(homeDir, ROVO_HOME, 'prompts.yml'),
      "prompts:\n  - name: 'hand-authored'\n    description: 'kept'\n    content_file: custom.md\n",
      'utf8',
    );

    await syncGlobalCommand(makeOptions({ harness: 'rovo' }), homeDir);

    const prompts = await readFile(path.join(homeDir, ROVO_HOME, 'prompts.yml'), 'utf8');
    expect(prompts).toContain("name: 'hand-authored'");
    expect(prompts).toContain('content_file: custom.md');
    expect(prompts).toContain("name: 'people-report'");
    expect(prompts).toContain('# codeassembly:managed:start');
  });

  it('retires a pre-existing ~/.agents/rulebooks/ tree, and writes none of its own', async () => {
    await seedGuidanceFile('.claude', 'CLAUDE.md');
    await writeFixtureRulebook('alpha', 'delivery: ambient', 'Alpha rules.');
    await declareRaw('rulebooks:\n  use:\n    - alpha\n');
    const neutralDir = path.join(homeDir, '.agents', 'rulebooks');
    await mkdir(neutralDir, { recursive: true });
    await writeFile(path.join(neutralDir, 'alpha.md'), '# Alpha\n', 'utf8');

    await syncGlobalCommand(makeOptions(), homeDir);

    expect(existsSync(neutralDir)).toBe(false);
  });

  it('keeps a ~/.agents/rulebooks/ entry that it does not own, and the directory containing it', async () => {
    await seedGuidanceFile('.claude', 'CLAUDE.md');
    await writeFixtureRulebook('alpha', 'delivery: ambient', 'Alpha rules.');
    await declareRaw('rulebooks:\n  use:\n    - alpha\n');
    const neutralDir = path.join(homeDir, '.agents', 'rulebooks');
    await mkdir(neutralDir, { recursive: true });
    await writeFile(path.join(neutralDir, 'alpha.md'), '# Alpha\n', 'utf8');
    await writeFile(path.join(neutralDir, 'notes.txt'), 'mine\n', 'utf8');

    await syncGlobalCommand(makeOptions(), homeDir);

    expect(existsSync(path.join(neutralDir, 'alpha.md'))).toBe(false);
    expect(await readFile(path.join(neutralDir, 'notes.txt'), 'utf8')).toBe('mine\n');
  });

  describe('home provenance', () => {
    it('stamps the run that it completed', async () => {
      await declareRaw('rulebooks:\n  use: []\n');

      await syncGlobalCommand(makeOptions(), homeDir);

      expect(await readHomeProvenance(homeDir)).toMatchObject({ command: 'sync --global' });
    });

    it('leaves the stamp untouched on a dry run', async () => {
      await declareRaw('rulebooks:\n  use: []\n');

      await syncGlobalCommand(makeOptions({ dryRun: true }), homeDir);

      expect(existsSync(getHomeProvenancePath(homeDir))).toBe(false);
    });

    it("leaves the stamp untouched when a home declaration to act on doesn't exist", async () => {
      await syncGlobalCommand(makeOptions(), homeDir);

      expect(existsSync(getHomeProvenancePath(homeDir))).toBe(false);
    });
  });

  describe('designated-writer guard', () => {
    it('refuses a mismatched installation before deploying anything', async () => {
      const guidanceFile = await seedGuidanceFile('.claude', 'CLAUDE.md');
      await writeFixtureRulebook('alpha', 'delivery: ambient', 'Alpha rules.');
      await declareRaw(`home-writer: ${path.join(homeDir, 'designated')}\nrulebooks:\n  use:\n    - alpha\n`);

      await expect(syncGlobalCommand(makeOptions(), homeDir)).rejects.toThrow(/not the designated home-domain writer/);
      expect(await readFile(guidanceFile, 'utf8')).not.toContain('Alpha rules.');
    });

    it('refuses a dry run exactly as it refuses the real one', async () => {
      await declareRaw(`home-writer: ${path.join(homeDir, 'designated')}\n`);

      await expect(syncGlobalCommand(makeOptions({ dryRun: true }), homeDir)).rejects.toThrow(
        /not the designated home-domain writer/,
      );
    });

    it('deploys when the setting designates the running installation', async () => {
      const guidanceFile = await seedGuidanceFile('.claude', 'CLAUDE.md');
      await writeFixtureRulebook('alpha', 'delivery: ambient', 'Alpha rules.');
      await declareRaw(`home-writer: ${resolveRunningPackageRoot()}\nrulebooks:\n  use:\n    - alpha\n`);

      await syncGlobalCommand(makeOptions(), homeDir);

      expect(await readFile(guidanceFile, 'utf8')).toContain('Alpha rules.');
    });
  });
});
