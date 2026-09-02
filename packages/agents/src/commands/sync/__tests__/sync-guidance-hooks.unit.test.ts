import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { InstallOptions } from '../../../lib/types.ts';
import { type GuidanceHookAdvisory, syncCommand } from '../sync.ts';

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

  it('names the bound rulebook version directly below the open marker', async () => {
    await writeLibrarySkill(contentDir, 'implement-plan', '<!-- guidance-hook: impl -->\n');
    await writeLibraryRulebook(contentDir, 'layout-preferences', '# Layout preferences\n\nRules.\n', 'hook', '4');
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
    expect(deployed).toContain('<!-- rulebook:layout-preferences -->\n<!-- rulebook-version: 4 -->');
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

  describe('advisories', () => {
    it('reports a bound rulebook whose delivery never claims the hook route', async () => {
      await writeLibrarySkill(contentDir, 'implement-plan', '<!-- guidance-hook: impl -->\n');
      await writeLibraryRulebook(contentDir, 'layout-preferences', '# Layout\n\nRules.\n', 'skill');
      await declareBinding(projectRoot, 'layout-preferences');

      const advisories = await syncAdvisories(projectRoot, contentDir, homeDir);

      expect(advisories).toEqual([{ kind: 'bound-undeclared', slug: 'layout-preferences', hook: 'impl' }]);
    });

    it('reports a bound rulebook that also charges every session', async () => {
      await writeLibrarySkill(contentDir, 'implement-plan', '<!-- guidance-hook: impl -->\n');
      await writeLibraryRulebook(contentDir, 'layout-preferences', '# Layout\n\nRules.\n', '[ambient, hook]');
      await declareBinding(projectRoot, 'layout-preferences');

      const advisories = await syncAdvisories(projectRoot, contentDir, homeDir);

      expect(advisories).toEqual([
        { kind: 'bound-ambient', slug: 'layout-preferences', hook: 'impl', skills: ['implement-plan'] },
      ]);
    });

    // The two routes reach disjoint audiences here: the ambient region is loaded by a session, and a subagent runs
    // without it, so the pairing is how one rulebook reaches both rather than a rulebook charging anyone twice.
    it('reports nothing when only a subagent declares the bound hook', async () => {
      await writeLibrarySubagent(contentDir, 'coder', '<!-- guidance-hook: impl -->\n');
      await writeLibraryRulebook(contentDir, 'layout-preferences', '# Layout\n\nRules.\n', '[ambient, hook]');
      await declareSubagentBinding(projectRoot, 'layout-preferences');

      const advisories = await syncAdvisories(projectRoot, contentDir, homeDir);

      expect(advisories).toEqual([]);
    });

    it('reports a binding whose hook no deployed skill or subagent declares', async () => {
      await writeLibrarySkill(contentDir, 'implement-plan', 'Prose carrying no directive.\n');
      await writeLibraryRulebook(contentDir, 'layout-preferences', '# Layout\n\nRules.\n', '[hook, skill]');
      await declareBinding(projectRoot, 'layout-preferences');

      const advisories = await syncAdvisories(projectRoot, contentDir, homeDir);

      expect(advisories).toEqual([{ kind: 'bound-unreached', hook: 'impl' }]);
    });

    it('reports both findings for a bound rulebook that is ambient and claims no hook route', async () => {
      await writeLibrarySkill(contentDir, 'implement-plan', '<!-- guidance-hook: impl -->\n');
      await writeLibraryRulebook(contentDir, 'layout-preferences', '# Layout\n\nRules.\n', 'ambient');
      await declareBinding(projectRoot, 'layout-preferences');

      const advisories = await syncAdvisories(projectRoot, contentDir, homeDir);

      expect(advisories).toEqual([
        { kind: 'bound-undeclared', slug: 'layout-preferences', hook: 'impl' },
        { kind: 'bound-ambient', slug: 'layout-preferences', hook: 'impl', skills: ['implement-plan'] },
      ]);
    });

    it('reports a rulebook that claims the hook route while no binding names it', async () => {
      await writeLibraryRulebook(contentDir, 'layout-preferences', '# Layout\n\nRules.\n', '[hook, skill]');
      await declare(projectRoot, ['rulebooks:', '  use:', '    - layout-preferences']);

      const advisories = await syncAdvisories(projectRoot, contentDir, homeDir);

      expect(advisories).toEqual([{ kind: 'declared-unbound', slug: 'layout-preferences' }]);
    });

    it('reports nothing when a binding and the rulebook it names agree', async () => {
      await writeLibrarySkill(contentDir, 'implement-plan', '<!-- guidance-hook: impl -->\n');
      await writeLibraryRulebook(contentDir, 'layout-preferences', '# Layout\n\nRules.\n', '[hook, skill]');
      await declareBinding(projectRoot, 'layout-preferences');

      const advisories = await syncAdvisories(projectRoot, contentDir, homeDir);

      expect(advisories).toEqual([]);
    });
  });
});

// region | Helpers

/** Writes the project-scope codeassembly.yaml from the given lines. */
async function declare(projectRoot: string, lines: ReadonlyArray<string>): Promise<void> {
  await writeFile(path.join(projectRoot, '.agents', 'codeassembly.yaml'), `${lines.join('\n')}\n`, 'utf8');
}

/** Declares the `implement-plan` skill with `slug` bound to the `impl` hook, the shape the advisory cases share. */
async function declareBinding(projectRoot: string, slug: string): Promise<void> {
  await declare(projectRoot, [
    'skills:',
    '  use:',
    '    - implement-plan',
    'guidance-hooks:',
    '  impl:',
    '    use:',
    `      - ${slug}`,
  ]);
}

/** Declares the `coder` subagent with `slug` bound to the `impl` hook, reaching the hook without any skill. */
async function declareSubagentBinding(projectRoot: string, slug: string): Promise<void> {
  await declare(projectRoot, [
    'subagents:',
    '  use:',
    '    - coder',
    'guidance-hooks:',
    '  impl:',
    '    use:',
    `      - ${slug}`,
  ]);
}

/** Build sync options targeting only the Claude harness. */
function makeOptions(): InstallOptions {
  return { harness: 'claude', link: false, force: false, dryRun: false };
}

/** Runs a sync and returns the guidance-hook advisories its plan carries. */
async function syncAdvisories(
  projectRoot: string,
  contentDir: string,
  homeDir: string,
): Promise<ReadonlyArray<GuidanceHookAdvisory>> {
  const outcome = await syncCommand(makeOptions(), projectRoot, contentDir, homeDir);
  if (outcome.kind !== 'reconciled') {
    throw new Error(`Expected a reconciled sync, but no declaration was found at ${outcome.declarationPath}.`);
  }
  return outcome.plan.guidanceHookAdvisories;
}

/**
 * Writes a fixture rulebook into the temp content library, defaulting to ambient delivery. `delivery` is written
 * into the frontmatter verbatim, so a test states a list as it would author one: `'[hook, skill]'`.
 */
async function writeLibraryRulebook(
  contentDir: string,
  slug: string,
  body: string,
  delivery = 'ambient',
  version?: string,
): Promise<void> {
  const dir = path.join(contentDir, 'guidance', 'rulebooks');
  await mkdir(dir, { recursive: true });
  const versionLine = version === undefined ? '' : `version: ${version}\n`;
  const frontmatter = `slug: ${slug}\ndescription: Fixture ${slug}\ndelivery: ${delivery}\n${versionLine}`;
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

/** Writes the Claude harness overlay supplying the `_defaults` the subagent frontmatter merge applies. */
async function writeOverlays(contentDir: string): Promise<void> {
  const dataDir = path.join(contentDir, 'subagents', '_data');
  await mkdir(dataDir, { recursive: true });
  await writeFile(path.join(dataDir, 'claude.yaml'), '_defaults:\n  permissionMode: bypassPermissions\n', 'utf8');
}

// endregion | Helpers
