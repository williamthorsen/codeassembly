import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { captureStdio } from '@williamthorsen/toolbelt.testing/candidate';
import { silenceConsole } from '@williamthorsen/toolbelt.vitest/candidate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { NoContentSourceError } from '../../lib/declared-sources.ts';
import { libraryListCommand, printLibraryUsage } from '../library-list.ts';
import { declareFixtureSource, FIXTURE_SOURCE_NAME } from '../test-utils/declare-fixture-source.ts';

describe(libraryListCommand, () => {
  let baseDir: string;
  let contentDir: string;
  let homeDir: string;
  let projectDir: string;

  beforeEach(async () => {
    baseDir = path.join(tmpdir(), `agents-test-library-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    contentDir = path.join(baseDir, 'content');
    homeDir = path.join(baseDir, 'home');
    projectDir = path.join(baseDir, 'project');
    await mkdir(homeDir, { recursive: true });
    await mkdir(projectDir, { recursive: true });
    await writeLibraryFixture(contentDir);
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  describe('a project declaring the fixture source', () => {
    beforeEach(async () => {
      await declareFixtureSource(projectDir, contentDir);
    });

    it('lists rulebooks, skills, and subagents with their slugs, source, and delivery values', async () => {
      const { output } = await captureList({ global: false }, projectDir, homeDir);

      expect(output).toContain('sample-rulebook');
      expect(output.split('\n', 1)[0]).toContain('source');
      expect(output.split('\n').find((line) => line.includes('sample-rulebook'))).toContain(FIXTURE_SOURCE_NAME);
      expect(output).toContain('ambient, skill');
      expect(output).toContain('bravo-skill');
      expect(output).toContain('yankee-agent');
    });

    it('orders rulebooks before skills before subagents before collections', async () => {
      const { output } = await captureList({ global: false }, projectDir, homeDir);

      expect(output.indexOf('sample-rulebook')).toBeLessThan(output.indexOf('bravo-skill'));
      expect(output.indexOf('bravo-skill')).toBeLessThan(output.indexOf('yankee-agent'));
      expect(output.indexOf('yankee-agent')).toBeLessThan(output.indexOf('sample-collection'));
    });

    it('lists a collection with an em-dash delivery, since a collection does not have a deploy mode', async () => {
      const { output } = await captureList({ global: false }, projectDir, homeDir);
      const lines = output.split('\n');

      expect(lines.find((line) => line.includes('sample-collection'))).toContain('—');
    });

    it('excludes underscore-prefixed support entries, dotfiles, and skill dirs without a SKILL.md', async () => {
      const { output } = await captureList({ global: false }, projectDir, homeDir);

      expect(output).not.toContain('hidden-rulebook');
      expect(output).not.toContain('empty-dir');
      expect(output).not.toContain('reserved');
    });

    it('falls back to the file name when a subagent does not declare a name', async () => {
      const { output } = await captureList({ global: false }, projectDir, homeDir);

      expect(output).toContain('xray');
    });

    it('lists a skill with an em-dash delivery, since a skill does not have a delivery mode', async () => {
      const { output } = await captureList({ global: false }, projectDir, homeDir);
      const lines = output.split('\n');

      expect(lines.find((line) => line.includes('bravo-skill'))).toContain('—');
    });

    it("shows a harness-restricted skill's target harness in the delivery column", async () => {
      const { output } = await captureList({ global: false }, projectDir, homeDir);
      const lines = output.split('\n');

      expect(lines.find((line) => line.includes('charlie-skill'))).toContain('rovo');
    });

    it("appends a harness-restricted rulebook's target harnesses to its delivery modes", async () => {
      const { output } = await captureList({ global: false }, projectDir, homeDir);
      const lines = output.split('\n');

      expect(lines.find((line) => line.includes('restricted-rulebook'))).toContain('ambient, skill (claude)');
      expect(lines.find((line) => line.includes('sample-rulebook'))).not.toContain('(');
    });

    it('lists a subagent with an em-dash delivery, since a subagent does not have a delivery mode', async () => {
      const { output } = await captureList({ global: false }, projectDir, homeDir);
      const lines = output.split('\n');

      expect(lines.find((line) => line.includes('yankee-agent'))).toContain('—');
    });

    it('skips an artifact with invalid frontmatter and keeps listing the rest', async () => {
      const { output, warnings } = await captureList({ global: false }, projectDir, homeDir);

      expect(warnings).toContain('bad.md');
      expect(output).toContain('sample-rulebook');
    });

    it('skips a subagent with malformed YAML frontmatter rather than aborting the listing', async () => {
      const { output, warnings } = await captureList({ global: false }, projectDir, homeDir);

      expect(warnings).toContain('broken.md');
      expect(output).toContain('yankee-agent');
    });
  });

  describe('two declared sources providing one slug', () => {
    let teamDir: string;

    beforeEach(async () => {
      teamDir = path.join(baseDir, 'team');
      await writeSkillAt(teamDir, 'bravo', 'bravo-skill', 'Team bravo.');
      await writeSkillAt(teamDir, 'alpha', 'alpha-skill', 'Team alpha.');
      await declareFixtureSource(projectDir, contentDir, `sources:\n  - name: team\n    path: ${teamDir}\n`);
    });

    it('lists both rows, marking the lower-precedence one as shadowed', async () => {
      const { output } = await captureList({ global: false }, projectDir, homeDir);
      const bravoLines = output.split('\n').filter((line) => line.includes('bravo-skill'));

      expect(bravoLines).toHaveLength(2);
      expect(bravoLines[0]).toMatch(/bravo-skill\s+team\s/);
      expect(bravoLines[0]).not.toContain('(shadowed)');
      expect(bravoLines[1]).toContain(`${FIXTURE_SOURCE_NAME} (shadowed)`);
    });

    it('orders rows by type, then slug, then source precedence', async () => {
      const { output } = await captureList({ global: false }, projectDir, homeDir);
      const order = [
        'sample-rulebook',
        'alpha-skill',
        'Team bravo.',
        ' Bravo.',
        'charlie-skill',
        'yankee-agent',
        'sample-collection',
      ].map((marker) => output.indexOf(marker));

      expect(order.every((index) => index >= 0)).toBe(true);
      expect(order).toEqual(order.toSorted((a, b) => a - b));
    });

    it('does not mark a slug that only one source provides as shadowed', async () => {
      const { output } = await captureList({ global: false }, projectDir, homeDir);
      const lines = output.split('\n');

      expect(lines.find((line) => line.includes('alpha-skill'))).not.toContain('(shadowed)');
      expect(lines.find((line) => line.includes('charlie-skill'))).not.toContain('(shadowed)');
    });

    it('prints each source with its absolute directory and artifacts, in precedence order, under json', async () => {
      const { output } = await captureList({ global: false, json: true }, projectDir, homeDir);
      const parsed: unknown = JSON.parse(output);

      expect(parsed).toMatchObject({
        sources: [
          {
            name: 'team',
            dir: teamDir,
            artifacts: expect.arrayContaining([{ type: 'skill', slug: 'bravo-skill' }]),
          },
          {
            name: FIXTURE_SOURCE_NAME,
            dir: contentDir,
            artifacts: expect.arrayContaining([expect.objectContaining({ type: 'rulebook', slug: 'sample-rulebook' })]),
          },
        ],
      });
    });
  });

  it('lists the home chain as json when global and json are both set', async () => {
    await declareFixtureSource(homeDir, contentDir);

    const { output } = await captureList({ global: true, json: true }, projectDir, homeDir);

    expect(JSON.parse(output)).toMatchObject({ sources: [{ name: FIXTURE_SOURCE_NAME, dir: contentDir }] });
  });

  it('reads the home chain when global is set', async () => {
    await declareFixtureSource(homeDir, contentDir);

    const { output } = await captureList({ global: true }, projectDir, homeDir);

    expect(output).toContain('sample-rulebook');
    expect(output.split('\n').find((line) => line.includes('sample-rulebook'))).toContain(FIXTURE_SOURCE_NAME);
  });

  it('ignores the project chain when global is set', async () => {
    await declareFixtureSource(projectDir, contentDir);

    await expect(captureList({ global: true }, projectDir, homeDir)).rejects.toBeInstanceOf(NoContentSourceError);
  });

  it('throws NoContentSourceError when the project does not declare any source', async () => {
    await declareFixtureSource(homeDir, contentDir);

    await expect(captureList({ global: false }, projectDir, homeDir)).rejects.toBeInstanceOf(NoContentSourceError);
  });
});

describe(printLibraryUsage, () => {
  it('outputs the available subcommands', () => {
    using silent = silenceConsole(['info']);

    printLibraryUsage();

    expect(silent.info).toHaveBeenCalledWith(expect.stringContaining('list'));
    expect(silent.info).toHaveBeenCalledWith(expect.stringContaining('library'));
  });
});

// region | Helpers

/** Runs the command from `cwd`, returning its captured stdout table and stderr warnings. */
async function captureList(
  options: { global: boolean; json?: boolean },
  cwd: string,
  homeDir: string,
): Promise<{ output: string; warnings: string }> {
  using stdio = captureStdio({ includeConsole: true });
  await libraryListCommand(options, cwd, homeDir);
  return { output: stdio.stdout, warnings: stdio.stderr };
}

/** Scaffolds a content tree exercising inclusion, exclusion, fallback, and invalid-frontmatter handling. */
async function writeLibraryFixture(contentDir: string): Promise<void> {
  const rulebooks = path.join(contentDir, 'guidance', 'rulebooks');
  const skills = path.join(contentDir, 'skills');
  const subagents = path.join(contentDir, 'subagents');
  const collections = path.join(contentDir, 'collections');
  await mkdir(collections, { recursive: true });
  await mkdir(rulebooks, { recursive: true });
  await mkdir(path.join(skills, 'bravo'), { recursive: true });
  await mkdir(path.join(skills, 'charlie'), { recursive: true });
  await mkdir(path.join(skills, '_data'), { recursive: true });
  await mkdir(path.join(skills, 'empty-dir'), { recursive: true });
  await mkdir(path.join(subagents, '_partials'), { recursive: true });

  await writeFile(
    path.join(rulebooks, 'sample.md'),
    renderFrontmatter({ slug: 'sample-rulebook', description: 'Sample rulebook.', delivery: '[ambient, skill]' }),
  );
  await writeFile(
    path.join(rulebooks, 'restricted.md'),
    renderFrontmatter({
      slug: 'restricted-rulebook',
      description: 'Restricted rulebook.',
      delivery: '[ambient, skill]',
      'supported-harnesses': 'claude',
    }),
  );
  await writeFile(path.join(rulebooks, '_hidden.md'), renderFrontmatter({ slug: 'hidden-rulebook' }));
  await writeFile(path.join(rulebooks, 'bad.md'), renderFrontmatter({ slug: 'Not A Valid Slug' }));

  await writeFile(
    path.join(skills, 'bravo', 'SKILL.md'),
    renderFrontmatter({ name: 'bravo-skill', description: 'Bravo.' }),
  );
  await writeFile(
    path.join(skills, 'charlie', 'SKILL.md'),
    renderFrontmatter({ name: 'charlie-skill', description: 'Charlie.', 'supported-harnesses': '[rovo]' }),
  );
  await writeFile(path.join(skills, '_data', 'reserved.md'), renderFrontmatter({ name: 'reserved' }));

  await writeFile(
    path.join(subagents, 'yankee.md'),
    renderFrontmatter({ name: 'yankee-agent', description: 'Yankee.' }),
  );
  await writeFile(path.join(subagents, 'xray.md'), renderFrontmatter({ description: 'Xray without a name.' }));
  await writeFile(path.join(subagents, 'broken.md'), '---\nname: "unterminated\ndescription: oops\n---\n\n# Body\n');

  await writeFile(
    path.join(collections, 'sample.md'),
    renderFrontmatter({ name: 'sample-collection', description: 'Sample collection.' }),
  );
}

/** Renders a minimal markdown file with the given frontmatter keys and a throwaway body. */
function renderFrontmatter(fields: Record<string, string>): string {
  const body = Object.entries(fields)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
  return `---\n${body}\n---\n\n# Body\n`;
}

/** Writes a skill `<dir>/skills/<dirName>/SKILL.md` declaring `name` and `description`. */
async function writeSkillAt(dir: string, dirName: string, name: string, description: string): Promise<void> {
  const skillDir = path.join(dir, 'skills', dirName);
  await mkdir(skillDir, { recursive: true });
  await writeFile(path.join(skillDir, 'SKILL.md'), renderFrontmatter({ name, description }));
}

// endregion | Helpers
