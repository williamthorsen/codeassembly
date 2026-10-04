import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { InstallOptions } from '../../../lib/types.ts';
import { declareFixtureSource, FIXTURE_SOURCE_NAME } from '../../test-utils/declare-fixture-source.ts';
import { syncCommand } from '../sync.ts';
import { renderReportText } from '../test-utils/render-report-text.ts';

// Exercises the `packages:` declaration: A package's content dir joins the source search order and its catalog seeds
// the closure, so naming the package is the whole declaration. Fixture packages live under the temp project's own
// `node_modules`, which is the first directory that Node's resolver searches from there (without a real install).
describe('sync with a declared package', () => {
  const PACKAGE_NAME = '@ca-fixture/guide';

  let projectRoot: string;
  let contentDir: string;
  let packageDir: string;
  // Because targeting reads the home tier's declaration and detects installed harnesses under it, every run below
  // is given a temp home rather than the developer's own.
  let homeDir: string;

  beforeEach(async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    homeDir = path.join(tmpdir(), `agents-test-sync-pkg-home-${stamp}`);
    projectRoot = path.join(tmpdir(), `agents-test-sync-pkg-proj-${stamp}`);
    contentDir = path.join(tmpdir(), `agents-test-sync-pkg-content-${stamp}`);
    packageDir = path.join(projectRoot, 'node_modules', PACKAGE_NAME);
    await mkdir(homeDir, { recursive: true });
    await mkdir(path.join(projectRoot, '.agents'), { recursive: true });
    await mkdir(path.join(contentDir, 'guidance', 'rulebooks'), { recursive: true });
    await writeOverlays();
    await installPackage(PACKAGE_NAME, 'codeassembly');
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(projectRoot, { recursive: true, force: true });
    await rm(homeDir, { recursive: true, force: true });
    await rm(contentDir, { recursive: true, force: true });
  });

  function makeOptions(overrides: Partial<InstallOptions> = {}): InstallOptions {
    return { harness: 'claude', link: false, force: false, dryRun: false, ...overrides };
  }

  const skillPath = (slug: string): string => path.join(projectRoot, '.claude', 'skills', slug, 'SKILL.md');
  const subagentPath = (slug: string): string => path.join(projectRoot, '.claude', 'agents', `${slug}.md`);
  const localHostPath = (): string => path.join(projectRoot, 'CLAUDE.local.md');
  const supportPath = (sourceName: string, file: string): string =>
    path.join(projectRoot, '.claude', 'skills', '_sources', sourceName, file);

  /** Writes a support file under a content root's `skills/`, outside any skill. */
  async function writeSupportFile(root: string, file: string): Promise<void> {
    const filePath = path.join(root, 'skills', file);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, '# Support\n', 'utf8');
  }

  /** Installs a fixture package under the project's `node_modules`, declaring `content` as its content directory. */
  async function installPackage(name: string, content: string): Promise<void> {
    const dir = path.join(projectRoot, 'node_modules', name);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'package.json'), JSON.stringify({ name, codeassembly: { content } }), 'utf8');
  }

  /** Writes the project-scope codeassembly.yaml from `body`, declaring the library fixture as a source beside it. */
  async function declare(body: string): Promise<void> {
    await declareFixtureSource(projectRoot, contentDir, body);
  }

  /** Writes a rulebook into a content root, which may be the package's, a plain source's, or the library's. */
  async function writeRulebook(root: string, slug: string, frontmatter: string, body: string): Promise<void> {
    const dir = path.join(root, 'guidance', 'rulebooks');
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, `${slug}.md`), `---\nslug: ${slug}\n${frontmatter}\n---\n\n${body}\n`, 'utf8');
  }

  /** Writes a skill into a content root, with an optional `dependencies:` block. */
  async function writeSkill(root: string, slug: string, frontmatter = ''): Promise<void> {
    const dir = path.join(root, 'skills', slug);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'SKILL.md'), `---\nname: ${slug}\n${frontmatter}---\n\n# ${slug}\n`, 'utf8');
  }

  /** Writes a subagent into a content root. */
  async function writeSubagent(root: string, slug: string): Promise<void> {
    const dir = path.join(root, 'subagents');
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, `${slug}.md`), `---\nname: ${slug}\n---\n\n# ${slug}\n\nUse {tool:Read}.\n`, 'utf8');
  }

  /** Writes a members-based collection into a content root. */
  async function writeCollection(root: string, slug: string, skills: ReadonlyArray<string>): Promise<void> {
    const dir = path.join(root, 'collections');
    await mkdir(dir, { recursive: true });
    const members = `members:\n  skills:\n${skills.map((member) => `    - ${member}`).join('\n')}\n`;
    await writeFile(path.join(dir, `${slug}.md`), `---\nname: ${slug}\n${members}---\n\n# ${slug}\n`, 'utf8');
  }

  /** Writes the Claude subagent frontmatter overlay into a content root. */
  async function writeOverlay(root: string, body: string): Promise<void> {
    const dataDir = path.join(root, 'subagents', '_data');
    await mkdir(dataDir, { recursive: true });
    await writeFile(path.join(dataDir, 'claude.yaml'), body, 'utf8');
  }

  /** Writes the library's Claude overlay, whose `_defaults` a library-resolved subagent merges against. */
  async function writeOverlays(): Promise<void> {
    await writeOverlay(contentDir, '_defaults:\n  model: sonnet\n');
  }

  /** The package's content root, as resolved from its declared `codeassembly.content`. */
  const packageContent = (): string => path.join(packageDir, 'codeassembly');

  // A hand-declared source outranks a package, so overriding one by pointing a `sources` entry at a local directory is
  // the documented pattern; naming that entry after the package that it overrides makes the two tiers collide.
  it('fails the run with nothing written when a hand-declared source takes an adopted package name', async () => {
    const localDir = path.join(projectRoot, 'local-guidance');
    await mkdir(path.join(localDir, 'skills'), { recursive: true });
    await mkdir(path.join(packageDir, 'codeassembly', 'skills'), { recursive: true });
    await declare(
      `sources:\n  - name: '${PACKAGE_NAME}'\n    path: ${localDir}\npackages:\n  use:\n    - '${PACKAGE_NAME}'\n`,
    );

    await expect(syncCommand(makeOptions({ dryRun: true }), projectRoot, homeDir)).rejects.toThrow(
      /claimed more than once.*@ca-fixture\/guide/s,
    );
  });

  it('merges a package subagent against the package overlay rather than the library one', async () => {
    await writeSubagent(packageContent(), 'pkg-agent');
    await writeOverlay(packageContent(), '_defaults:\n  model: haiku\n');
    await declare(`packages:\n  use:\n    - '${PACKAGE_NAME}'\n`);

    await syncCommand(makeOptions(), projectRoot, homeDir);

    const deployed = await readFile(subagentPath('pkg-agent'), 'utf8');
    expect(deployed).toContain('model: haiku');
    expect(deployed).not.toContain('model: sonnet');
  });

  it('does not apply any defaults to a subagent from a source without an overlay', async () => {
    await writeSubagent(packageContent(), 'pkg-agent');
    await declare(`packages:\n  use:\n    - '${PACKAGE_NAME}'\n`);

    await syncCommand(makeOptions(), projectRoot, homeDir);

    expect(await readFile(subagentPath('pkg-agent'), 'utf8')).not.toContain('model:');
  });

  it('merges a library subagent against the library overlay when a source ships its own', async () => {
    await writeSubagent(contentDir, 'lib-agent');
    await writeOverlay(packageContent(), '_defaults:\n  model: haiku\n');
    await declare(`packages:\n  use:\n    - '${PACKAGE_NAME}'\nsubagents:\n  use:\n    - lib-agent\n`);

    await syncCommand(makeOptions(), projectRoot, homeDir);

    expect(await readFile(subagentPath('lib-agent'), 'utf8')).toContain('model: sonnet');
  });

  it('deploys every deployable artifact shipped by the package, from the package name alone', async () => {
    await writeRulebook(packageContent(), 'pkg-rules', 'delivery: skill\ndescription: From the package.', 'Pkg rules.');
    await writeSkill(packageContent(), 'pkg-skill');
    await writeSubagent(packageContent(), 'pkg-agent');
    await declare(`packages:\n  use:\n    - '${PACKAGE_NAME}'\n`);

    await syncCommand(makeOptions(), projectRoot, homeDir);

    expect(await readFile(skillPath('consult-pkg-rules'), 'utf8')).toContain('Pkg rules.');
    expect(existsSync(skillPath('pkg-skill'))).toBe(true);
    expect(existsSync(subagentPath('pkg-agent'))).toBe(true);
  });

  it('delivers an ambient rulebook from the package to the local host', async () => {
    await writeRulebook(packageContent(), 'pkg-ambient', 'delivery: ambient', 'Ambient package rules.');
    await declare(`packages:\n  use:\n    - '${PACKAGE_NAME}'\n`);

    await syncCommand(makeOptions(), projectRoot, homeDir);

    expect(await readFile(localHostPath(), 'utf8')).toContain('Ambient package rules.');
  });

  it('resolves a collection from the package when the project declares it', async () => {
    await writeSkill(packageContent(), 'member-skill');
    await writeCollection(packageContent(), 'pkg-bundle', ['member-skill']);
    await declare(`packages:\n  use:\n    - '${PACKAGE_NAME}'\ncollections:\n  use:\n    - pkg-bundle\n`);

    await syncCommand(makeOptions(), projectRoot, homeDir);

    expect(existsSync(skillPath('member-skill'))).toBe(true);
  });

  it('pulls in a library artifact on which a package artifact depends', async () => {
    await writeRulebook(contentDir, 'library-dep', 'delivery: skill', 'Library dependency.');
    await writeSkill(packageContent(), 'pkg-skill', 'dependencies:\n  rulebooks:\n    - library-dep\n');
    await declare(`packages:\n  use:\n    - '${PACKAGE_NAME}'\n`);

    await syncCommand(makeOptions(), projectRoot, homeDir);

    expect(await readFile(skillPath('consult-library-dep'), 'utf8')).toContain('Library dependency.');
  });

  it('lets a hand-declared source outrank a package source on a shared slug', async () => {
    const sourceDir = path.join(projectRoot, 'local-guidance');
    await writeRulebook(sourceDir, 'contested', 'delivery: ambient', 'Source body.');
    await writeRulebook(packageContent(), 'contested', 'delivery: ambient', 'Package body.');
    await declare(
      `sources:\n  - name: org\n    path: ${sourceDir}\npackages:\n  use:\n    - '${PACKAGE_NAME}'\nrulebooks:\n  use:\n    - contested\n`,
    );

    await syncCommand(makeOptions(), projectRoot, homeDir);

    const localHost = await readFile(localHostPath(), 'utf8');
    expect(localHost).toContain('Source body.');
    expect(localHost).not.toContain('Package body.');
  });

  // The library fixture is a hand-declared source, and every hand-declared source outranks a package.
  it('warns when the hand-declared library source shadows a same-slug package artifact', async () => {
    await writeRulebook(contentDir, 'shadowed', 'delivery: ambient', 'Library body.');
    await writeRulebook(packageContent(), 'shadowed', 'delivery: ambient', 'Package body.');
    await declare(`packages:\n  use:\n    - '${PACKAGE_NAME}'\n`);

    const outcome = await syncCommand(makeOptions(), projectRoot, homeDir);

    const localHost = await readFile(localHostPath(), 'utf8');
    expect(localHost).toContain('Library body.');
    expect(localHost).not.toContain('Package body.');
    expect(renderReportText(outcome, { level: 'warn' })).toContain(
      `rulebook "shadowed" (source "${FIXTURE_SOURCE_NAME}" over source "${PACKAGE_NAME}")`,
    );
  });

  it('keeps a hand-declared source resolving alongside a declared package', async () => {
    const sourceDir = path.join(projectRoot, 'local-guidance');
    await writeRulebook(sourceDir, 'from-source', 'delivery: ambient', 'Source rules.');
    await writeRulebook(packageContent(), 'from-package', 'delivery: ambient', 'Package rules.');
    await declare(
      `sources:\n  - name: org\n    path: ${sourceDir}\npackages:\n  use:\n    - '${PACKAGE_NAME}'\nrulebooks:\n  use:\n    - from-source\n`,
    );

    await syncCommand(makeOptions(), projectRoot, homeDir);

    const localHost = await readFile(localHostPath(), 'utf8');
    expect(localHost).toContain('Source rules.');
    expect(localHost).toContain('Package rules.');
  });

  it('retracts a package artifact once a higher tier drops the package', async () => {
    await writeRulebook(packageContent(), 'pkg-ambient', 'delivery: ambient', 'Ambient package rules.');
    await declare(`packages:\n  use:\n    - '${PACKAGE_NAME}'\n`);
    await syncCommand(makeOptions(), projectRoot, homeDir);
    expect(await readFile(localHostPath(), 'utf8')).toContain('Ambient package rules.');

    await writeFile(
      path.join(projectRoot, '.agents', 'codeassembly.local.yaml'),
      `packages:\n  drop:\n    - '${PACKAGE_NAME}'\n`,
      'utf8',
    );
    await syncCommand(makeOptions(), projectRoot, homeDir);

    expect(await readFile(localHostPath(), 'utf8')).not.toContain('Ambient package rules.');
  });

  it('lets a higher-tier package outrank a committed-tier one on a shared slug', async () => {
    await installPackage('@ca-fixture/base', 'codeassembly');
    await installPackage('@ca-fixture/local', 'codeassembly');
    const baseContent = path.join(projectRoot, 'node_modules', '@ca-fixture/base', 'codeassembly');
    const localContent = path.join(projectRoot, 'node_modules', '@ca-fixture/local', 'codeassembly');
    await writeRulebook(baseContent, 'contested', 'delivery: ambient', 'Base body.');
    await writeRulebook(localContent, 'contested', 'delivery: ambient', 'Local body.');
    await declare("packages:\n  use:\n    - '@ca-fixture/base'\n");
    await writeFile(
      path.join(projectRoot, '.agents', 'codeassembly.local.yaml'),
      "packages:\n  use:\n    - '@ca-fixture/local'\n",
      'utf8',
    );

    await syncCommand(makeOptions(), projectRoot, homeDir);

    const localHost = await readFile(localHostPath(), 'utf8');
    expect(localHost).toContain('Local body.');
    expect(localHost).not.toContain('Base body.');
  });

  it('lets the last package declared in a tier outrank an earlier one on a shared slug', async () => {
    await installPackage('@ca-fixture/first', 'codeassembly');
    await installPackage('@ca-fixture/second', 'codeassembly');
    const firstContent = path.join(projectRoot, 'node_modules', '@ca-fixture/first', 'codeassembly');
    const secondContent = path.join(projectRoot, 'node_modules', '@ca-fixture/second', 'codeassembly');
    await writeRulebook(firstContent, 'contested', 'delivery: ambient', 'First body.');
    await writeRulebook(secondContent, 'contested', 'delivery: ambient', 'Second body.');
    await declare("packages:\n  use:\n    - '@ca-fixture/first'\n    - '@ca-fixture/second'\n");

    const outcome = await syncCommand(makeOptions(), projectRoot, homeDir);

    const localHost = await readFile(localHostPath(), 'utf8');
    expect(localHost).toContain('Second body.');
    expect(localHost).not.toContain('First body.');
    expect(renderReportText(outcome, { level: 'warn' })).toContain(
      'rulebook "contested" (source "@ca-fixture/second" over source "@ca-fixture/first")',
    );
  });

  it('stops advising a package that the project declined with drop', async () => {
    await writeRulebook(packageContent(), 'pkg-ambient', 'delivery: ambient', 'Ambient package rules.');
    await writeFile(
      path.join(projectRoot, 'package.json'),
      JSON.stringify({ name: 'consumer', devDependencies: { [PACKAGE_NAME]: '1.0.0' } }),
      'utf8',
    );
    await declare(`packages:\n  use:\n    - '${PACKAGE_NAME}'\n`);
    await writeFile(
      path.join(projectRoot, '.agents', 'codeassembly.local.yaml'),
      `packages:\n  drop:\n    - '${PACKAGE_NAME}'\n`,
      'utf8',
    );

    const outcome = await syncCommand(makeOptions(), projectRoot, homeDir);

    expect(renderReportText(outcome)).not.toContain(PACKAGE_NAME);
  });

  it('advises adopting an installed dependency whose guidance the project has not declared', async () => {
    await writeFile(
      path.join(projectRoot, 'package.json'),
      JSON.stringify({ name: 'consumer', devDependencies: { [PACKAGE_NAME]: '1.0.0' } }),
      'utf8',
    );
    await declare('rulebooks:\n  use: []\n');

    const outcome = await syncCommand(makeOptions(), projectRoot, homeDir);

    const advice = renderReportText(outcome);
    expect(advice).toContain(PACKAGE_NAME);
    expect(advice).toMatch(/packages:\n {2}use:/);
  });

  it('stops advising once the dependency is declared', async () => {
    await writeFile(
      path.join(projectRoot, 'package.json'),
      JSON.stringify({ name: 'consumer', devDependencies: { [PACKAGE_NAME]: '1.0.0' } }),
      'utf8',
    );
    await writeRulebook(packageContent(), 'pkg-ambient', 'delivery: ambient', 'Ambient package rules.');
    await declare(`packages:\n  use:\n    - '${PACKAGE_NAME}'\n`);

    const outcome = await syncCommand(makeOptions(), projectRoot, homeDir);

    expect(renderReportText(outcome)).not.toContain('has not declared');
  });

  describe('named by a sources entry', () => {
    it('deploys only the declared artifacts and their closure, with support under the package namespace', async () => {
      await writeRulebook(packageContent(), 'pkg-dep', 'delivery: skill', 'Package dependency.');
      await writeSkill(packageContent(), 'pkg-skill', 'dependencies:\n  rulebooks:\n    - pkg-dep\n');
      await writeSkill(packageContent(), 'pkg-undeclared');
      await writeSubagent(packageContent(), 'pkg-agent');
      await writeSupportFile(packageContent(), path.join('_data', 'house-style.md'));
      await declare(`sources:\n  - package: '${PACKAGE_NAME}'\nskills:\n  use:\n    - pkg-skill\n`);

      await syncCommand(makeOptions(), projectRoot, homeDir);

      expect(existsSync(skillPath('pkg-skill'))).toBe(true);
      expect(await readFile(skillPath('consult-pkg-dep'), 'utf8')).toContain('Package dependency.');
      expect(existsSync(skillPath('pkg-undeclared'))).toBe(false);
      expect(existsSync(subagentPath('pkg-agent'))).toBe(false);
      expect(existsSync(supportPath(PACKAGE_NAME, path.join('_data', 'house-style.md')))).toBe(true);
    });

    // Mirrors how pnpm links an external dependency or a `workspace:*` sibling: The `node_modules` entry is a symlink.
    it('resolves a package whose node_modules entry is a symlink', async () => {
      const realDir = path.join(projectRoot, 'workspace-packages', 'linked');
      await mkdir(path.join(realDir, 'content'), { recursive: true });
      await writeFile(
        path.join(realDir, 'package.json'),
        JSON.stringify({ name: '@ca-fixture/linked', codeassembly: { content: 'content' } }),
        'utf8',
      );
      await writeSkill(path.join(realDir, 'content'), 'linked-skill');
      await symlink(realDir, path.join(projectRoot, 'node_modules', '@ca-fixture', 'linked'), 'dir');
      await declare("sources:\n  - package: '@ca-fixture/linked'\nskills:\n  use:\n    - linked-skill\n");

      await syncCommand(makeOptions(), projectRoot, homeDir);

      expect(existsSync(skillPath('linked-skill'))).toBe(true);
    });

    it('does not advise adopting the package through packages', async () => {
      await writeFile(
        path.join(projectRoot, 'package.json'),
        JSON.stringify({ name: 'consumer', devDependencies: { [PACKAGE_NAME]: '1.0.0' } }),
        'utf8',
      );
      await writeSkill(packageContent(), 'pkg-skill');
      await declare(`sources:\n  - name: guide\n    package: '${PACKAGE_NAME}'\nskills:\n  use:\n    - pkg-skill\n`);

      const outcome = await syncCommand(makeOptions(), projectRoot, homeDir);

      expect(renderReportText(outcome)).not.toContain('has not declared');
    });

    it('fails the run when the package is not installed, writing nothing', async () => {
      await declare("sources:\n  - package: '@ca-fixture/absent'\n");

      await expect(syncCommand(makeOptions(), projectRoot, homeDir)).rejects.toThrow(
        /Declared source "@ca-fixture\/absent" \(package "@ca-fixture\/absent"\) is not installed/,
      );
      expect(existsSync(path.join(projectRoot, '.claude'))).toBe(false);
    });
  });

  it('fails the run when a declared package is not installed, writing nothing', async () => {
    await declare("packages:\n  use:\n    - '@ca-fixture/absent'\n");

    await expect(syncCommand(makeOptions(), projectRoot, homeDir)).rejects.toThrow(
      /"@ca-fixture\/absent" is not installed/,
    );
    expect(existsSync(path.join(projectRoot, '.agents', 'rulebooks'))).toBe(false);
  });

  it('warns and completes when a declared package points at a content directory that it does not ship', async () => {
    await installPackage('@ca-fixture/empty', 'missing-dir');
    await declare("packages:\n  use:\n    - '@ca-fixture/empty'\n");

    const outcome = await syncCommand(makeOptions(), projectRoot, homeDir);

    const warning = renderReportText(outcome, { level: 'warn' });
    expect(warning).toMatch(/Declared source "@ca-fixture\/empty" \(.*missing-dir\) does not exist/);
    expect(warning).toContain('report the omission upstream');
  });
});
