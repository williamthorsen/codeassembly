import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { syncCommand, syncGlobalCommand } from '../../src/commands/sync/sync.ts';
import { resolveContentDir } from '../../src/lib/content-resolver.ts';
import type { InstallOptions } from '../../src/lib/types.ts';

// Syncs real library artifacts end-to-end, to catch a canary that no longer deploys, renders, or retracts.
describe('sync of real library canaries', () => {
  const contentDir = resolveContentDir();
  let projectRoot: string;
  // Because targeting reads the home tier's declaration and detects installed harnesses under it, every run below is
  // given a temp home rather than the developer's own.
  let homeDir: string;

  beforeEach(async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    projectRoot = path.join(tmpdir(), `agents-test-library-sync-proj-${stamp}`);
    homeDir = path.join(tmpdir(), `agents-test-library-sync-home-${stamp}`);
    await mkdir(path.join(projectRoot, '.agents'), { recursive: true });
    await mkdir(homeDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
    await rm(homeDir, { recursive: true, force: true });
  });

  function makeOptions(overrides: Partial<InstallOptions> = {}): InstallOptions {
    return { harness: 'claude', link: false, force: false, dryRun: false, ...overrides };
  }

  /** Writes the project-scope codeassembly.yaml declaring the given slugs under one artifact type. */
  async function declareProject(type: string, ...slugs: ReadonlyArray<string>): Promise<void> {
    const useBlock =
      slugs.length === 0 ? '  use: []\n' : `  use:\n${slugs.map((slug) => `    - ${slug}`).join('\n')}\n`;
    await writeFile(path.join(projectRoot, '.agents', 'codeassembly.yaml'), `${type}:\n${useBlock}`, 'utf8');
  }

  const skillPath = (slug: string): string => path.join(projectRoot, '.claude', 'skills', slug, 'SKILL.md');

  const subagentPath = (slug: string): string => path.join(projectRoot, '.claude', 'agents', `${slug}.md`);

  it('deploys and retracts the shell-conventions rulebook as its consult skill', async () => {
    await declareProject('rulebooks', 'shell-conventions');
    await syncCommand(makeOptions(), projectRoot, contentDir, homeDir);

    const skill = await readFile(skillPath('consult-shell-conventions'), 'utf8');
    expect(skill).toContain('name: consult-shell-conventions');
    expect(skill).toContain('# Shell script conventions');
    expect(skill).not.toContain('slug:');

    await declareProject('rulebooks');
    await syncCommand(makeOptions(), projectRoot, contentDir, homeDir);

    expect(existsSync(path.dirname(skillPath('consult-shell-conventions')))).toBe(false);
  });

  it('deploys and retracts the people-report skill', async () => {
    await declareProject('skills', 'people-report');
    await syncCommand(makeOptions(), projectRoot, contentDir, homeDir);

    const skill = await readFile(skillPath('people-report'), 'utf8');
    expect(skill).toContain('<!-- codeassembly-skill:people-report -->');
    expect(skill).toContain('# People report');

    await declareProject('skills');
    await syncCommand(makeOptions(), projectRoot, contentDir, homeDir);

    expect(existsSync(path.dirname(skillPath('people-report')))).toBe(false);
  });

  it('deploys and retracts the canary subagent', async () => {
    await declareProject('subagents', 'canary');
    await syncCommand(makeOptions(), projectRoot, contentDir, homeDir);

    const deployed = await readFile(subagentPath('canary'), 'utf8');
    expect(deployed).toContain('<!-- codeassembly-subagent:canary -->');
    expect(deployed).toContain('# Canary');
    expect(deployed).not.toContain('{tool:Read}');
    expect(deployed).not.toContain('{harness_home_dir}');
    expect(deployed).toContain('~/.claude');

    await declareProject('subagents');
    await syncCommand(makeOptions(), projectRoot, contentDir, homeDir);

    expect(existsSync(subagentPath('canary'))).toBe(false);
  });

  it('deploys the recommended collection to home via the user-global declaration', async () => {
    await mkdir(path.join(homeDir, '.agents'), { recursive: true });
    await writeFile(
      path.join(homeDir, '.agents', 'codeassembly.yaml'),
      'collections:\n  use:\n    - recommended\n',
      'utf8',
    );

    await syncGlobalCommand(makeOptions(), homeDir, contentDir);

    expect(existsSync(path.join(homeDir, '.claude', 'skills', 'capture-event', 'SKILL.md'))).toBe(true);
    // `canary` is standalone: A vetted collection whose closure reaches it is a defect.
    expect(existsSync(path.join(homeDir, '.claude', 'agents', 'canary.md'))).toBe(false);
  });
});
