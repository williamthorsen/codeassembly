import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { InstallOptions } from '../../../lib/types.ts';
import { syncCommand } from '../sync.ts';

describe('syncCommand with guidance-hook bindings', () => {
  let projectRoot: string;
  let contentDir: string;
  // Targeting reads the home tier's declaration and detects installed harnesses under it, so every run below is
  // given a temp home rather than the developer's own.
  let homeDir: string;

  beforeEach(async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    homeDir = path.join(tmpdir(), `agents-test-sync-hooks-home-${stamp}`);
    projectRoot = path.join(tmpdir(), `agents-test-sync-hooks-proj-${stamp}`);
    contentDir = path.join(tmpdir(), `agents-test-sync-hooks-content-${stamp}`);
    await mkdir(homeDir, { recursive: true });
    await mkdir(path.join(projectRoot, '.agents'), { recursive: true });
    await mkdir(contentDir, { recursive: true });
    await writeOverlays(contentDir);
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
    await rm(homeDir, { recursive: true, force: true });
    await rm(contentDir, { recursive: true, force: true });
  });

  it('fills a declared skill and subagent with the guidance bound to their hook', async () => {
    await writeLibrarySkill(contentDir, 'implement-plan', 'Write the code.\n\n<!-- guidance-hook: impl -->\n');
    await writeLibrarySubagent(contentDir, 'coder', 'Write the code.\n\n<!-- guidance-hook: impl -->\n');
    await writeLibraryRulebook(contentDir, 'layout-preferences', '# Layout preferences\n\nGroup source by role.\n');
    await declare(projectRoot, [
      'skills:',
      '  use:',
      '    - implement-plan',
      'subagents:',
      '  use:',
      '    - coder',
      'guidance-hooks:',
      '  impl:',
      '    use:',
      '      - layout-preferences',
    ]);

    await syncCommand(makeOptions(), projectRoot, contentDir, homeDir);

    for (const deployed of [
      await readFile(path.join(projectRoot, '.claude', 'skills', 'implement-plan', 'SKILL.md'), 'utf8'),
      await readFile(path.join(projectRoot, '.claude', 'agents', 'coder.md'), 'utf8'),
    ]) {
      expect(deployed).toContain('<!-- codeassembly-guidance-hook:impl:start -->');
      expect(deployed).toContain('<!-- rulebook:layout-preferences -->');
      expect(deployed).toContain('## Layout preferences');
      expect(deployed).toContain('Group source by role.');
      expect(deployed).not.toContain('<!-- guidance-hook:');
    }
  });

  it('deploys a bound rulebook by its own delivery mode without a separate declaration', async () => {
    await writeLibrarySkill(contentDir, 'implement-plan', '<!-- guidance-hook: impl -->\n');
    await writeLibraryRulebook(contentDir, 'layout-preferences', '# Layout preferences\n\nRules.\n', 'skill');
    await declare(projectRoot, [
      'skills:',
      '  use:',
      '    - implement-plan',
      'guidance-hooks:',
      '  impl:',
      '    use:',
      '      - layout-preferences',
    ]);

    await syncCommand(makeOptions(), projectRoot, contentDir, homeDir);

    const consultSkill = path.join(projectRoot, '.claude', 'skills', 'consult-layout-preferences', 'SKILL.md');
    expect(existsSync(consultSkill)).toBe(true);
  });

  it('leaves a hook no binding names contributing nothing at all', async () => {
    await writeLibrarySkill(contentDir, 'implement-plan', 'Prose.\n\n<!-- guidance-hook: glossary -->\n');
    await writeLibraryRulebook(contentDir, 'layout-preferences', '# Layout preferences\n\nRules.\n');
    await declare(projectRoot, [
      'skills:',
      '  use:',
      '    - implement-plan',
      'guidance-hooks:',
      '  impl:',
      '    use:',
      '      - layout-preferences',
    ]);

    await syncCommand(makeOptions(), projectRoot, contentDir, homeDir);

    const deployed = await readFile(path.join(projectRoot, '.claude', 'skills', 'implement-plan', 'SKILL.md'), 'utf8');
    expect(deployed).not.toContain('guidance-hook');
    expect(deployed).not.toContain('Layout preferences');
  });

  it('fails when a binding names a rulebook that does not exist, naming the slug and the hook', async () => {
    await writeLibrarySkill(contentDir, 'implement-plan', '<!-- guidance-hook: impl -->\n');
    await declare(projectRoot, [
      'skills:',
      '  use:',
      '    - implement-plan',
      'guidance-hooks:',
      '  impl:',
      '    use:',
      '      - ghost-preferences',
    ]);

    await expect(syncCommand(makeOptions(), projectRoot, contentDir, homeDir)).rejects.toThrow(
      /Guidance hook "impl" binds rulebook "ghost-preferences"/,
    );
    expect(existsSync(path.join(projectRoot, '.claude'))).toBe(false);
  });

  it('fails when a bound rulebook declares a guidance hook of its own', async () => {
    await writeLibrarySkill(contentDir, 'implement-plan', '<!-- guidance-hook: impl -->\n');
    await writeLibraryRulebook(contentDir, 'layout-preferences', '# Layout\n\n<!-- guidance-hook: nested -->\n');
    await declare(projectRoot, [
      'skills:',
      '  use:',
      '    - implement-plan',
      'guidance-hooks:',
      '  impl:',
      '    use:',
      '      - layout-preferences',
    ]);

    await expect(syncCommand(makeOptions(), projectRoot, contentDir, homeDir)).rejects.toThrow(
      /Rulebook "layout-preferences", bound to guidance hook "impl", declares a guidance hook of its own \(nested\)/,
    );
  });

  it('writes byte-identical output when a filled skill is synced twice', async () => {
    await writeLibrarySkill(contentDir, 'implement-plan', 'Prose.\n\n<!-- guidance-hook: impl -->\n');
    await writeLibraryRulebook(contentDir, 'layout-preferences', '# Layout preferences\n\nRules.\n');
    await declare(projectRoot, [
      'skills:',
      '  use:',
      '    - implement-plan',
      'guidance-hooks:',
      '  impl:',
      '    use:',
      '      - layout-preferences',
    ]);
    const deployedPath = path.join(projectRoot, '.claude', 'skills', 'implement-plan', 'SKILL.md');

    await syncCommand(makeOptions(), projectRoot, contentDir, homeDir);
    const first = await readFile(deployedPath, 'utf8');
    await syncCommand(makeOptions(), projectRoot, contentDir, homeDir);

    expect(await readFile(deployedPath, 'utf8')).toBe(first);
  });
});

// region | Helpers

/** Build sync options targeting only the Claude harness. */
function makeOptions(): InstallOptions {
  return { harness: 'claude', link: false, force: false, dryRun: false };
}

/** Writes the project-scope codeassembly.yaml from the given lines. */
async function declare(projectRoot: string, lines: ReadonlyArray<string>): Promise<void> {
  await writeFile(path.join(projectRoot, '.agents', 'codeassembly.yaml'), `${lines.join('\n')}\n`, 'utf8');
}

/** Writes a fixture rulebook into the temp content library, defaulting to ambient delivery. */
async function writeLibraryRulebook(
  contentDir: string,
  slug: string,
  body: string,
  delivery: 'ambient' | 'skill' = 'ambient',
): Promise<void> {
  const dir = path.join(contentDir, 'guidance', 'rulebooks');
  await mkdir(dir, { recursive: true });
  const frontmatter = `slug: ${slug}\ndescription: Fixture ${slug}\ndelivery: ${delivery}\n`;
  await writeFile(path.join(dir, `${slug}.md`), `---\n${frontmatter}---\n\n${body}`, 'utf8');
}

/** Writes a fixture skill into the temp content library's `skills/<slug>/SKILL.md`. */
async function writeLibrarySkill(contentDir: string, slug: string, body: string): Promise<void> {
  const dir = path.join(contentDir, 'skills', slug);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'SKILL.md'), `---\nname: ${slug}\n---\n\n# ${slug}\n\n${body}`, 'utf8');
}

/** Writes a fixture subagent `<slug>.md` into the temp content library's `subagents/`. */
async function writeLibrarySubagent(contentDir: string, slug: string, body: string): Promise<void> {
  const dir = path.join(contentDir, 'subagents');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${slug}.md`), `---\nname: ${slug}\n---\n\n# ${slug}\n\n${body}`, 'utf8');
}

/** Writes the Claude harness overlay so the subagent transform has its tool mapping and defaults. */
async function writeOverlays(contentDir: string): Promise<void> {
  const dataDir = path.join(contentDir, 'subagents', '_data');
  await mkdir(dataDir, { recursive: true });
  await writeFile(
    path.join(dataDir, 'claude.yaml'),
    '_tools:\n  Read: Read\n\n_defaults:\n  permissionMode: bypassPermissions\n',
    'utf8',
  );
}

// endregion | Helpers
