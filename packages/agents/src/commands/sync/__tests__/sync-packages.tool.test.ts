import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { InstallOptions } from '../../../lib/types.ts';
import { syncCommand } from '../sync.ts';
import { renderReportText } from '../test-utils/render-report-text.ts';

// Exercises the `packages:` declaration: a package's content dir joins the source search order and its catalog seeds
// the closure, so naming the package is the whole declaration. Fixture packages live under the temp project's own
// `node_modules`, which is the first directory Node's resolver searches from there — no real install involved.
describe('sync with a declared package', () => {
  const PACKAGE_NAME = '@ca-fixture/guide';

  let projectRoot: string;
  let contentDir: string;
  let packageDir: string;
  // Targeting reads the home tier's declaration and detects installed harnesses under it, so every run below is
  // given a temp home rather than the developer's own.
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

  /** Installs a fixture package under the project's `node_modules`, declaring `content` as its content directory. */
  async function installPackage(name: string, content: string): Promise<void> {
    const dir = path.join(projectRoot, 'node_modules', name);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'package.json'), JSON.stringify({ name, codeassembly: { content } }), 'utf8');
  }

  /** Writes the project-scope codeassembly.yaml verbatim. */
  async function declare(body: string): Promise<void> {
    await writeFile(path.join(projectRoot, '.agents', 'codeassembly.yaml'), body, 'utf8');
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

  /** Writes the Claude harness overlay into the library, which is where the subagent transform reads it from. */
  async function writeOverlays(): Promise<void> {
    const dataDir = path.join(contentDir, 'subagents', '_data');
    await mkdir(dataDir, { recursive: true });
    await writeFile(
      path.join(dataDir, 'claude.yaml'),
      '_tools:\n  Read: Read\n\n_defaults:\n  model: sonnet\n',
      'utf8',
    );
  }

  /** The package's content root, as resolved from its declared `codeassembly.content`. */
  const packageContent = (): string => path.join(packageDir, 'codeassembly');

  // A hand-declared source outranks a package, so overriding one by pointing a `sources` entry at a local directory is
  // the documented pattern; naming that entry after the package it overrides is what makes the two tiers collide.
  it('fails the run with nothing written when a hand-declared source takes an adopted package name', async () => {
    const localDir = path.join(projectRoot, 'local-guidance');
    await mkdir(path.join(localDir, 'skills'), { recursive: true });
    await mkdir(path.join(packageDir, 'codeassembly', 'skills'), { recursive: true });
    await declare(
      `sources:\n  - name: '${PACKAGE_NAME}'\n    path: ${localDir}\npackages:\n  use:\n    - '${PACKAGE_NAME}'\n`,
    );

    await expect(syncCommand(makeOptions({ dryRun: true }), projectRoot, contentDir, homeDir)).rejects.toThrow(
      /claimed more than once.*@ca-fixture\/guide/s,
    );
  });

  it('deploys every deployable artifact the package ships, from the package name alone', async () => {
    await writeRulebook(packageContent(), 'pkg-rules', 'delivery: skill\ndescription: From the package.', 'Pkg rules.');
    await writeSkill(packageContent(), 'pkg-skill');
    await writeSubagent(packageContent(), 'pkg-agent');
    await declare(`packages:\n  use:\n    - '${PACKAGE_NAME}'\n`);

    await syncCommand(makeOptions(), projectRoot, contentDir, homeDir);

    expect(await readFile(skillPath('consult-pkg-rules'), 'utf8')).toContain('Pkg rules.');
    expect(existsSync(skillPath('pkg-skill'))).toBe(true);
    expect(existsSync(subagentPath('pkg-agent'))).toBe(true);
  });

  it('delivers an ambient rulebook the package ships to the local host', async () => {
    await writeRulebook(packageContent(), 'pkg-ambient', 'delivery: ambient', 'Ambient package rules.');
    await declare(`packages:\n  use:\n    - '${PACKAGE_NAME}'\n`);

    await syncCommand(makeOptions(), projectRoot, contentDir, homeDir);

    expect(await readFile(localHostPath(), 'utf8')).toContain('Ambient package rules.');
  });

  it('resolves a collection the package ships when the project declares it', async () => {
    await writeSkill(packageContent(), 'member-skill');
    await writeCollection(packageContent(), 'pkg-bundle', ['member-skill']);
    await declare(`packages:\n  use:\n    - '${PACKAGE_NAME}'\ncollections:\n  use:\n    - pkg-bundle\n`);

    await syncCommand(makeOptions(), projectRoot, contentDir, homeDir);

    expect(existsSync(skillPath('member-skill'))).toBe(true);
  });

  it('pulls in a library artifact a package artifact depends on', async () => {
    await writeRulebook(contentDir, 'library-dep', 'delivery: skill', 'Library dependency.');
    await writeSkill(packageContent(), 'pkg-skill', 'dependencies:\n  rulebooks:\n    - library-dep\n');
    await declare(`packages:\n  use:\n    - '${PACKAGE_NAME}'\n`);

    await syncCommand(makeOptions(), projectRoot, contentDir, homeDir);

    expect(await readFile(skillPath('consult-library-dep'), 'utf8')).toContain('Library dependency.');
  });

  it('lets a hand-declared source outrank a package source on a shared slug', async () => {
    const sourceDir = path.join(projectRoot, 'local-guidance');
    await writeRulebook(sourceDir, 'contested', 'delivery: ambient', 'Source body.');
    await writeRulebook(packageContent(), 'contested', 'delivery: ambient', 'Package body.');
    await declare(
      `sources:\n  - name: org\n    path: ${sourceDir}\npackages:\n  use:\n    - '${PACKAGE_NAME}'\nrulebooks:\n  use:\n    - contested\n`,
    );

    await syncCommand(makeOptions(), projectRoot, contentDir, homeDir);

    const localHost = await readFile(localHostPath(), 'utf8');
    expect(localHost).toContain('Source body.');
    expect(localHost).not.toContain('Package body.');
  });

  it('warns when a package source shadows a same-slug library artifact', async () => {
    await writeRulebook(contentDir, 'shadowed', 'delivery: ambient', 'Library body.');
    await writeRulebook(packageContent(), 'shadowed', 'delivery: ambient', 'Package body.');
    await declare(`packages:\n  use:\n    - '${PACKAGE_NAME}'\n`);

    const outcome = await syncCommand(makeOptions(), projectRoot, contentDir, homeDir);

    expect(await readFile(localHostPath(), 'utf8')).toContain('Package body.');
    expect(renderReportText(outcome, { level: 'warn' })).toMatch(/shadow.*shadowed/s);
  });

  it('keeps a hand-declared source resolving alongside a declared package', async () => {
    const sourceDir = path.join(projectRoot, 'local-guidance');
    await writeRulebook(sourceDir, 'from-source', 'delivery: ambient', 'Source rules.');
    await writeRulebook(packageContent(), 'from-package', 'delivery: ambient', 'Package rules.');
    await declare(
      `sources:\n  - name: org\n    path: ${sourceDir}\npackages:\n  use:\n    - '${PACKAGE_NAME}'\nrulebooks:\n  use:\n    - from-source\n`,
    );

    await syncCommand(makeOptions(), projectRoot, contentDir, homeDir);

    const localHost = await readFile(localHostPath(), 'utf8');
    expect(localHost).toContain('Source rules.');
    expect(localHost).toContain('Package rules.');
  });

  it('retracts a package artifact once a higher tier drops the package', async () => {
    await writeRulebook(packageContent(), 'pkg-ambient', 'delivery: ambient', 'Ambient package rules.');
    await declare(`packages:\n  use:\n    - '${PACKAGE_NAME}'\n`);
    await syncCommand(makeOptions(), projectRoot, contentDir, homeDir);
    expect(await readFile(localHostPath(), 'utf8')).toContain('Ambient package rules.');

    await writeFile(
      path.join(projectRoot, '.agents', 'codeassembly.local.yaml'),
      `packages:\n  drop:\n    - '${PACKAGE_NAME}'\n`,
      'utf8',
    );
    await syncCommand(makeOptions(), projectRoot, contentDir, homeDir);

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

    await syncCommand(makeOptions(), projectRoot, contentDir, homeDir);

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

    await syncCommand(makeOptions(), projectRoot, contentDir, homeDir);

    const localHost = await readFile(localHostPath(), 'utf8');
    expect(localHost).toContain('Second body.');
    expect(localHost).not.toContain('First body.');
  });

  it('stops advising a package the project declined with drop', async () => {
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

    const outcome = await syncCommand(makeOptions(), projectRoot, contentDir, homeDir);

    expect(renderReportText(outcome)).not.toContain(PACKAGE_NAME);
  });

  it('advises adopting an installed dependency that ships guidance the project has not declared', async () => {
    await writeFile(
      path.join(projectRoot, 'package.json'),
      JSON.stringify({ name: 'consumer', devDependencies: { [PACKAGE_NAME]: '1.0.0' } }),
      'utf8',
    );
    await declare('rulebooks:\n  use: []\n');

    const outcome = await syncCommand(makeOptions(), projectRoot, contentDir, homeDir);

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

    const outcome = await syncCommand(makeOptions(), projectRoot, contentDir, homeDir);

    expect(renderReportText(outcome)).not.toContain('has not declared');
  });

  it('fails the run when a declared package is not installed, writing nothing', async () => {
    await declare("packages:\n  use:\n    - '@ca-fixture/absent'\n");

    await expect(syncCommand(makeOptions(), projectRoot, contentDir, homeDir)).rejects.toThrow(
      /"@ca-fixture\/absent" is not installed/,
    );
    expect(existsSync(path.join(projectRoot, '.agents', 'rulebooks'))).toBe(false);
  });

  it('warns and completes when a declared package points at a content directory it does not ship', async () => {
    await installPackage('@ca-fixture/empty', 'missing-dir');
    await declare("packages:\n  use:\n    - '@ca-fixture/empty'\n");

    const outcome = await syncCommand(makeOptions(), projectRoot, contentDir, homeDir);

    expect(renderReportText(outcome, { level: 'warn' })).toMatch(
      /Declared source "@ca-fixture\/empty" \(.*missing-dir\) does not exist/,
    );
  });
});
