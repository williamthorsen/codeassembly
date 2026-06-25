import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { libraryListCommand, type LibraryRow, printLibraryUsage, renderLibraryTable } from '../library-list.ts';

describe(libraryListCommand, () => {
  let contentDir: string;

  beforeEach(async () => {
    contentDir = path.join(tmpdir(), `agents-test-library-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await writeLibraryFixture(contentDir);
  });

  afterEach(async () => {
    await rm(contentDir, { recursive: true, force: true });
  });

  it('lists rulebooks, skills, and subagents with their slugs and delivery values', async () => {
    const { output } = await captureList(contentDir);

    expect(output).toContain('sample-rulebook');
    expect(output).toContain('ambient, skill');
    expect(output).toContain('bravo-skill');
    expect(output).toContain('yankee-agent');
  });

  it('orders rulebooks before skills before subagents', async () => {
    const { output } = await captureList(contentDir);

    expect(output.indexOf('sample-rulebook')).toBeLessThan(output.indexOf('bravo-skill'));
    expect(output.indexOf('bravo-skill')).toBeLessThan(output.indexOf('yankee-agent'));
  });

  it('excludes underscore-prefixed support entries, dotfiles, and skill dirs without a SKILL.md', async () => {
    const { output } = await captureList(contentDir);

    expect(output).not.toContain('hidden-rulebook');
    expect(output).not.toContain('empty-dir');
    expect(output).not.toContain('reserved');
  });

  it('falls back to the file name when a subagent declares no name', async () => {
    const { output } = await captureList(contentDir);

    expect(output).toContain('xray');
  });

  it('shows a skill delivery of declared when it opts into declared delivery, install otherwise', async () => {
    const { output } = await captureList(contentDir);
    const lines = output.split('\n');

    expect(lines.find((line) => line.includes('charlie-skill'))).toContain('declared');
    expect(lines.find((line) => line.includes('bravo-skill'))).toContain('install');
  });

  it('skips an artifact with invalid frontmatter and keeps listing the rest', async () => {
    const { output, warnings } = await captureList(contentDir);

    expect(warnings.some((warning) => warning.includes('bad.md'))).toBe(true);
    expect(output).toContain('sample-rulebook');
  });

  it('skips a subagent with malformed YAML frontmatter rather than aborting the listing', async () => {
    const { output, warnings } = await captureList(contentDir);

    expect(warnings.some((warning) => warning.includes('broken.md'))).toBe(true);
    expect(output).toContain('yankee-agent');
  });
});

describe(printLibraryUsage, () => {
  it('outputs the available subcommands', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    printLibraryUsage();

    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('list'));
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('library'));

    infoSpy.mockRestore();
  });
});

describe(renderLibraryTable, () => {
  it('sorts rows by type (rulebook, skill, subagent), then by slug', () => {
    const rows: Array<LibraryRow> = [
      makeRow({ type: 'subagent', slug: 'bravo' }),
      makeRow({ type: 'skill', slug: 'zulu' }),
      makeRow({ type: 'skill', slug: 'alpha' }),
      makeRow({ type: 'rulebook', slug: 'romeo' }),
    ];

    const output = renderLibraryTable(rows, 100);
    const order = ['romeo', 'alpha', 'zulu', 'bravo'].map((slug) => output.indexOf(slug));

    expect(order).toEqual(order.toSorted((a, b) => a - b));
    expect(order.every((index) => index >= 0)).toBe(true);
  });

  it('renders a header and one line per row with the synthesized delivery value', () => {
    const rows: Array<LibraryRow> = [
      makeRow({ type: 'rulebook', emoji: '📕', slug: 'shell-conventions', delivery: 'ambient, skill' }),
      makeRow({ type: 'skill', emoji: '🪄', slug: 'add-test-ids', delivery: 'skill' }),
      makeRow({ type: 'subagent', emoji: '🤖', slug: 'planner', delivery: 'subagent' }),
    ];

    const lines = renderLibraryTable(rows, 100).split('\n');

    expect(lines[0]).toContain('type');
    expect(lines[0]).toContain('slug');
    expect(lines[0]).toContain('delivery');
    expect(lines[0]).toContain('description');
    expect(lines[1]).toContain('📕 rulebook');
    expect(lines[1]).toContain('ambient, skill');
    expect(lines[2]).toContain('🪄 skill');
    expect(lines[3]).toContain('🤖 subagent');
  });

  it('wraps a long description with a hanging indent aligned under the description column', () => {
    const row = makeRow({
      type: 'skill',
      emoji: '🪄',
      slug: 'demo',
      delivery: 'skill',
      description: 'one two three four five six seven eight nine ten',
    });

    // Column widths for this single row: type = 8 (`🪄 skill`), slug = 4 (`demo`), delivery = 8 (`delivery`
    // header). With gaps of 2 the description starts at column 8 + 2 + 4 + 2 + 8 + 2 = 26; width 46 leaves a
    // 20-cell description column.
    const lines = renderLibraryTable([row], 46).split('\n');
    const continuations = lines.slice(1).filter((line) => /^ +\S/.test(line));

    expect(lines[1]).toMatch(/one two three four$/);
    expect(continuations).toEqual([`${' '.repeat(26)}five six seven eight`, `${' '.repeat(26)}nine ten`]);
  });
});

/** Runs the command against a fixture content dir, returning its captured stdout table and stderr warnings. */
async function captureList(contentDir: string): Promise<{ output: string; warnings: Array<string> }> {
  const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  await libraryListCommand(contentDir);
  const output = infoSpy.mock.calls.map((call) => String(call[0])).join('\n');
  const warnings = warnSpy.mock.calls.map((call) => String(call[0]));
  infoSpy.mockRestore();
  warnSpy.mockRestore();
  return { output, warnings };
}

/** Builds a `LibraryRow` with sensible defaults, overriding only the fields a test cares about. */
function makeRow(overrides: Partial<LibraryRow>): LibraryRow {
  return { type: 'skill', emoji: '🪄', slug: 'slug', delivery: 'skill', description: 'A description.', ...overrides };
}

/** Scaffolds a content tree exercising inclusion, exclusion, fallback, and invalid-frontmatter handling. */
async function writeLibraryFixture(contentDir: string): Promise<void> {
  const rulebooks = path.join(contentDir, 'guidance', 'rulebooks');
  const skills = path.join(contentDir, 'skills');
  const subagents = path.join(contentDir, 'subagents');
  await mkdir(rulebooks, { recursive: true });
  await mkdir(path.join(skills, 'bravo'), { recursive: true });
  await mkdir(path.join(skills, 'charlie'), { recursive: true });
  await mkdir(path.join(skills, '_data'), { recursive: true });
  await mkdir(path.join(skills, 'empty-dir'), { recursive: true });
  await mkdir(path.join(subagents, '_partials'), { recursive: true });

  await writeFile(
    path.join(rulebooks, 'sample.md'),
    frontmatter({ slug: 'sample-rulebook', description: 'Sample rulebook.', delivery: '[ambient, skill]' }),
  );
  await writeFile(path.join(rulebooks, '_hidden.md'), frontmatter({ slug: 'hidden-rulebook' }));
  await writeFile(path.join(rulebooks, 'bad.md'), frontmatter({ slug: 'Not A Valid Slug' }));

  await writeFile(path.join(skills, 'bravo', 'SKILL.md'), frontmatter({ name: 'bravo-skill', description: 'Bravo.' }));
  await writeFile(
    path.join(skills, 'charlie', 'SKILL.md'),
    frontmatter({ name: 'charlie-skill', description: 'Charlie.', deploy: 'declared' }),
  );
  await writeFile(path.join(skills, '_data', 'reserved.md'), frontmatter({ name: 'reserved' }));

  await writeFile(path.join(subagents, 'yankee.md'), frontmatter({ name: 'yankee-agent', description: 'Yankee.' }));
  await writeFile(path.join(subagents, 'xray.md'), frontmatter({ description: 'Xray without a name.' }));
  await writeFile(path.join(subagents, 'broken.md'), '---\nname: "unterminated\ndescription: oops\n---\n\n# Body\n');
}

/** Renders a minimal markdown file with the given frontmatter keys and a throwaway body. */
function frontmatter(fields: Record<string, string>): string {
  const body = Object.entries(fields)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
  return `---\n${body}\n---\n\n# Body\n`;
}
