import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type ContentDefect, validateContentRoot } from '../content-validation.ts';
import { ALL_HARNESS_IDS } from '../harness.ts';

describe(validateContentRoot, () => {
  let root: string;

  beforeEach(async () => {
    // Built under the OS temp dir rather than the repo tree: this repo carries a `.agents/codeassembly.yaml` at its
    // root, so an in-tree fixture would sit below a declaration and could not show that none is consulted.
    root = path.join(tmpdir(), `agents-test-validate-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(root, { recursive: true });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('passes a content root carrying every artifact type, with no declaration anywhere above it', async () => {
    await writeSkill(root, 'alpha');
    await writeSubagent(root, 'helper');
    await writeRulebook(root, 'house-style');
    await writeCollection(root, 'starter', { skills: ['alpha'], subagents: ['helper'] });

    expect(await validateContentRoot(root, ALL_HARNESS_IDS)).toEqual([]);
  });

  it('reports a collection member that resolves from neither the root nor the library', async () => {
    await writeCollection(root, 'starter', { skills: ['no-such-skill'] });

    const defects = await validateContentRoot(root, ALL_HARNESS_IDS);

    expect(defects).toHaveLength(1);
    expect(defects[0]).toMatchObject({ file: 'collections/starter.md', kind: 'dependency' });
    expect(defects[0]?.detail).toContain('no-such-skill');
  });

  it('resolves a dependency into the built-in library rather than reporting it as dangling', async () => {
    await writeSkill(root, 'alpha', { dependencies: { subagents: ['canary'] } });

    expect(await validateContentRoot(root, ALL_HARNESS_IDS)).toEqual([]);
  });

  it('stays silent about a defect in a library artifact a dependency edge reached', async () => {
    const library = path.join(root, 'library');
    await writeSubagent(library, 'lib-helper', { body: 'See [the missing part](#nowhere).' });
    const producer = path.join(root, 'producer');
    await writeSkill(producer, 'alpha', { dependencies: { subagents: ['lib-helper'] } });

    expect(await validateContentRoot(producer, ALL_HARNESS_IDS, library)).toEqual([]);
  });

  it('reports the same defect when the artifact carrying it belongs to the root', async () => {
    const library = path.join(root, 'library');
    const producer = path.join(root, 'producer');
    await writeSubagent(producer, 'lib-helper', { body: 'See [the missing part](#nowhere).' });

    const defects = await validateContentRoot(producer, ALL_HARNESS_IDS, library);

    expect(defects).toHaveLength(1);
    expect(defects[0]).toMatchObject({ file: 'subagents/lib-helper.md', kind: 'render' });
  });

  it('reports an unmapped tool placeholder in a skill support file, which carries no SKILL.md', async () => {
    await writeSkill(root, 'alpha');
    await writeFileAt(root, 'skills/_data/reference.md', '# Reference\n\nRun {tool:NoSuchTool} to proceed.\n');

    const defects = await validateContentRoot(root, ALL_HARNESS_IDS);

    expect(defects).toHaveLength(1);
    expect(defects[0]).toMatchObject({ file: 'skills/_data', kind: 'render' });
    expect(defects[0]?.detail).toContain('NoSuchTool');
  });

  it('passes a support entry the installer copies verbatim rather than rendering', async () => {
    await writeSkill(root, 'alpha');
    await writeFileAt(root, 'skills/notes.json', '{ "note": "installed as a plain copy" }\n');
    await writeFileAt(root, 'skills/_data/logo.svg', '<svg />\n');

    expect(await validateContentRoot(root, ALL_HARNESS_IDS)).toEqual([]);
  });

  it('reports every defect in one run rather than stopping at the first', async () => {
    await writeCollection(root, 'starter', { skills: ['no-such-skill'] });
    await writeSubagent(root, 'helper', { body: 'See [the missing part](#nowhere).' });
    await writeRulebook(root, 'house-style', { body: 'Read [the notes](../../notes.md).' });

    const defects = await validateContentRoot(root, ALL_HARNESS_IDS);

    expect(filesOf(defects)).toEqual([
      'collections/starter.md',
      'guidance/rulebooks/house-style.md',
      'subagents/helper.md',
    ]);
  });

  it('reports a body-local defect once, however many harnesses render it', async () => {
    await writeSubagent(root, 'helper', { body: 'See [the missing part](#nowhere).' });

    const defects = await validateContentRoot(root, ALL_HARNESS_IDS);

    expect(defects).toHaveLength(1);
    expect(defects[0]?.detail).not.toContain('claude');
  });

  it('names the affected harnesses when a defect reaches only some of them', async () => {
    await writeSkill(root, 'alpha', { body: 'Invoke {tool:NoSuchTool}.', supportedHarnesses: ['claude'] });

    const defects = await validateContentRoot(root, ALL_HARNESS_IDS);

    expect(defects).toHaveLength(1);
    expect(defects[0]?.detail).toContain('(claude)');
  });

  it('reports a skill whose frontmatter still declares the retired harnesses key', async () => {
    await writeSkill(root, 'alpha', { retiredHarnesses: ['claude'] });

    const defects = await validateContentRoot(root, ALL_HARNESS_IDS);

    expect(defects).toHaveLength(1);
    expect(defects[0]?.kind).toBe('frontmatter');
    expect(defects[0]?.file).toBe('skills/alpha/SKILL.md');
    expect(defects[0]?.detail).toContain('supported-harnesses');
  });

  it('reports the retired key even when the skill also declares the current one', async () => {
    await writeSkill(root, 'alpha', { retiredHarnesses: ['claude'], supportedHarnesses: ['claude'] });

    const defects = await validateContentRoot(root, ALL_HARNESS_IDS);

    expect(defects).toHaveLength(1);
    expect(defects[0]?.kind).toBe('frontmatter');
  });

  it('passes a skill that declares only the current harness-narrowing key', async () => {
    await writeSkill(root, 'alpha', { supportedHarnesses: ['claude'] });

    expect(await validateContentRoot(root, ALL_HARNESS_IDS)).toEqual([]);
  });

  it('stays silent about a library skill declaring the retired key, which the root cannot rename', async () => {
    const library = path.join(root, 'library');
    await writeSkill(library, 'lib-legacy', { retiredHarnesses: ['claude'] });
    const producer = path.join(root, 'producer');
    await writeSkill(producer, 'alpha', { dependencies: { skills: ['lib-legacy'] } });

    expect(await validateContentRoot(producer, ALL_HARNESS_IDS, library)).toEqual([]);
  });

  it('reports two skill-delivery rulebooks that resolve to one skill name', async () => {
    await writeRulebook(root, 'first', { delivery: 'skill', skillName: 'shared-name' });
    await writeRulebook(root, 'second', { delivery: 'skill', skillName: 'shared-name' });

    const defects = await validateContentRoot(root, ALL_HARNESS_IDS);

    expect(defects).toHaveLength(1);
    expect(defects[0]).toMatchObject({ kind: 'collision' });
    expect(defects[0]?.detail).toContain('shared-name');
  });

  it('reports a rulebook link target that no harness home would carry', async () => {
    await writeRulebook(root, 'house-style', { body: 'Read [the notes](../../notes.md).' });

    const defects = await validateContentRoot(root, ALL_HARNESS_IDS);

    expect(defects).toHaveLength(1);
    expect(defects[0]).toMatchObject({ file: 'guidance/rulebooks/house-style.md', kind: 'render' });
  });

  it('reports an unusable content root on its own, without attempting the stages that need one', async () => {
    const defects = await validateContentRoot(path.join(root, 'absent'), ALL_HARNESS_IDS);

    expect(defects).toEqual([{ file: '.', kind: 'root', detail: 'Content root is unusable: does not exist.' }]);
  });
});

/** The defect files in sorted order, the shape an assertion on "which artifacts were reported" reads most clearly. */
function filesOf(defects: ReadonlyArray<ContentDefect>): ReadonlyArray<string> {
  return defects.map((defect) => defect.file).toSorted();
}

/** Writes `content` to a content-root-relative path, creating the intervening directories. */
async function writeFileAt(root: string, relPath: string, content: string): Promise<void> {
  const filePath = path.join(root, relPath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, 'utf8');
}

/** Writes a collection whose `members:` are the given per-type slug lists. */
async function writeCollection(
  root: string,
  slug: string,
  members: Record<string, ReadonlyArray<string>>,
): Promise<void> {
  const memberLines = Object.entries(members).flatMap(([type, slugs]) => [
    `  ${type}:`,
    ...slugs.map((member) => `    - ${member}`),
  ]);
  const frontmatter = [
    '---',
    `name: ${slug}`,
    `description: ${slug} fixture collection`,
    'members:',
    ...memberLines,
    '---',
  ];
  await writeFileAt(root, `collections/${slug}.md`, `${frontmatter.join('\n')}\n\n# ${slug}\n`);
}

/** Writes a rulebook, defaulting to ambient delivery and a body with nothing to reject. */
async function writeRulebook(
  root: string,
  slug: string,
  options: { body?: string; delivery?: string; skillName?: string } = {},
): Promise<void> {
  const frontmatter = [
    '---',
    `slug: ${slug}`,
    `description: ${slug} fixture rulebook`,
    `delivery: ${options.delivery ?? 'ambient'}`,
    ...(options.skillName === undefined ? [] : [`skill-name: ${options.skillName}`]),
    '---',
  ];
  await writeFileAt(
    root,
    `guidance/rulebooks/${slug}.md`,
    `${frontmatter.join('\n')}\n\n# ${slug}\n\n${options.body ?? 'Body.'}\n`,
  );
}

/** Writes a skill directory, optionally scoped to some harnesses or carrying a `dependencies:` block or custom body. */
async function writeSkill(
  root: string,
  slug: string,
  options: {
    body?: string;
    dependencies?: Record<string, ReadonlyArray<string>>;
    /** Emits the retired `harnesses:` key instead of the current one, for the pass that reports it. */
    retiredHarnesses?: ReadonlyArray<string>;
    supportedHarnesses?: ReadonlyArray<string>;
  } = {},
): Promise<void> {
  const frontmatter = [
    '---',
    `name: ${slug}`,
    `description: ${slug} fixture skill`,
    ...(options.supportedHarnesses === undefined
      ? []
      : ['supported-harnesses:', ...options.supportedHarnesses.map((id) => `  - ${id}`)]),
    ...(options.retiredHarnesses === undefined
      ? []
      : ['harnesses:', ...options.retiredHarnesses.map((id) => `  - ${id}`)]),
    ...renderDependencies(options.dependencies),
    '---',
  ];
  await writeFileAt(
    root,
    `skills/${slug}/SKILL.md`,
    `${frontmatter.join('\n')}\n\n# ${slug}\n\n${options.body ?? 'Body.'}\n`,
  );
}

/** Writes a subagent `.md` file, optionally carrying a custom body. */
async function writeSubagent(root: string, slug: string, options: { body?: string } = {}): Promise<void> {
  const frontmatter = ['---', `name: ${slug}`, `description: ${slug} fixture subagent`, '---'];
  await writeFileAt(
    root,
    `subagents/${slug}.md`,
    `${frontmatter.join('\n')}\n\n# ${slug}\n\n${options.body ?? 'Body.'}\n`,
  );
}

/** Renders a `dependencies:` frontmatter block, or nothing when the artifact declares none. */
function renderDependencies(dependencies: Record<string, ReadonlyArray<string>> | undefined): ReadonlyArray<string> {
  if (dependencies === undefined) {
    return [];
  }
  return [
    'dependencies:',
    ...Object.entries(dependencies).flatMap(([type, slugs]) => [`  ${type}:`, ...slugs.map((slug) => `    - ${slug}`)]),
  ];
}
