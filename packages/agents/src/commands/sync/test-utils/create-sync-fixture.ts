import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach } from 'vitest';

import { HARNESSES } from '../../../lib/harness.ts';
import type { InstallOptions } from '../../../lib/types.ts';
import { declareFixtureSource } from '../../test-utils/declare-fixture-source.ts';

const ROVO_HOME = HARNESSES.rovo.homeDir;

/** The temp directories of one `syncCommand` test and the helpers that write fixtures into them. */
export interface SyncFixture {
  /** The project under sync. */
  projectRoot: string;
  /** The fixture content source that the project declares. */
  contentDir: string;
  /**
   * The home tier. Targeting reads the home tier's declaration and detects installed harnesses under it, so every
   * run is given a temp home; without it a run would consult the developer's own, and its result would vary by
   * developer.
   */
  homeDir: string;
  makeOptions(overrides?: Partial<InstallOptions>): InstallOptions;
  installBothHarnesses(): Promise<void>;
  writeFixtureRulebook(slug: string, frontmatter: string, body: string): Promise<void>;
  writeFixtureSupportFile(relPath: string): Promise<void>;
  declareRulebooks(...slugs: ReadonlyArray<string>): Promise<void>;
  writeLocalDeclaration(content: string): Promise<void>;
  declarationPath(): string;
  localDeclarationPath(): string;
  projectMdPath(): string;
  agentsMdPath(): string;
  localHostPath(name?: string): string;
  skillPath(slug: string, dotDir?: string): string;
}

/**
 * Creates fresh project, content, and home directories before each test of the enclosing `describe` and removes them
 * after it. The returned record's directory fields are reassigned per test, so a test reads them inside its body, and
 * the helpers close over the record.
 */
export function createSyncFixture(): SyncFixture {
  const fixture: SyncFixture = {
    projectRoot: '',
    contentDir: '',
    homeDir: '',
    makeOptions,
    installBothHarnesses,
    writeFixtureRulebook,
    writeFixtureSupportFile,
    declareRulebooks,
    writeLocalDeclaration,
    declarationPath,
    localDeclarationPath,
    projectMdPath,
    agentsMdPath,
    localHostPath,
    skillPath,
  };

  beforeEach(async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    fixture.projectRoot = path.join(tmpdir(), `agents-test-sync-proj-${stamp}`);
    fixture.contentDir = path.join(tmpdir(), `agents-test-sync-content-${stamp}`);
    fixture.homeDir = path.join(tmpdir(), `agents-test-sync-home-${stamp}`);
    await mkdir(fixture.projectRoot, { recursive: true });
    await mkdir(path.join(fixture.contentDir, 'guidance', 'rulebooks'), { recursive: true });
    await mkdir(fixture.homeDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(fixture.projectRoot, { recursive: true, force: true });
    await rm(fixture.contentDir, { recursive: true, force: true });
    await rm(fixture.homeDir, { recursive: true, force: true });
  });

  /** Installs both harnesses under the test home, which is what an unpinned `harness: 'all'` run detects. */
  async function installBothHarnesses(): Promise<void> {
    await mkdir(path.join(fixture.homeDir, '.claude'), { recursive: true });
    await mkdir(path.join(fixture.homeDir, ROVO_HOME), { recursive: true });
  }

  /** Writes a fixture rulebook into the fixture source tree. */
  async function writeFixtureRulebook(slug: string, frontmatter: string, body: string): Promise<void> {
    const file = path.join(fixture.contentDir, 'guidance', 'rulebooks', `${slug}.md`);
    await writeFile(file, `---\nslug: ${slug}\n${frontmatter}\n---\n\n${body}\n`, 'utf8');
  }

  /** Writes a support file under the fixture source's `skills/`, at a path relative to that directory. */
  async function writeFixtureSupportFile(relPath: string): Promise<void> {
    const file = path.join(fixture.contentDir, 'skills', relPath);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, '# Support\n\n## Block\n', 'utf8');
  }

  /** Writes the project-scope codeassembly.yaml declaring the fixture source and the given rulebook slugs. */
  async function declareRulebooks(...slugs: ReadonlyArray<string>): Promise<void> {
    const useBlock =
      slugs.length === 0 ? '  use: []\n' : `  use:\n${slugs.map((slug) => `    - ${slug}`).join('\n')}\n`;
    await declareFixtureSource(fixture.projectRoot, fixture.contentDir, `rulebooks:\n${useBlock}`);
  }

  /** Writes the project-local codeassembly.local.yaml verbatim, for multi-tier and drop cases. */
  async function writeLocalDeclaration(content: string): Promise<void> {
    await mkdir(path.join(fixture.projectRoot, '.agents'), { recursive: true });
    await writeFile(path.join(fixture.projectRoot, '.agents', 'codeassembly.local.yaml'), content, 'utf8');
  }

  /** Returns the path of the project-scope codeassembly.yaml. */
  function declarationPath(): string {
    return path.join(fixture.projectRoot, '.agents', 'codeassembly.yaml');
  }

  /** Returns the path of the project-local codeassembly.local.yaml. */
  function localDeclarationPath(): string {
    return path.join(fixture.projectRoot, '.agents', 'codeassembly.local.yaml');
  }

  /** Returns the path of the project's PROJECT.md. */
  function projectMdPath(): string {
    return path.join(fixture.projectRoot, '.agents', 'PROJECT.md');
  }

  /** Returns the path of the project's AGENTS.md. */
  function agentsMdPath(): string {
    return path.join(fixture.projectRoot, 'AGENTS.md');
  }

  /** Returns the path of the project-local ambient host for a harness, which `sync` owns and creates. */
  function localHostPath(name = 'CLAUDE.local.md'): string {
    return path.join(fixture.projectRoot, name);
  }

  /** Returns the path of a deployed skill's SKILL.md under the harness directory. */
  function skillPath(slug: string, dotDir = '.claude'): string {
    return path.join(fixture.projectRoot, dotDir, 'skills', slug, 'SKILL.md');
  }

  return fixture;
}

// region | Helpers
/** Builds sync options for the Claude harness, with the overrides applied. */
function makeOptions(overrides: Partial<InstallOptions> = {}): InstallOptions {
  return { harness: 'claude', link: false, force: false, dryRun: false, ...overrides };
}
// endregion | Helpers
