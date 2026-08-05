import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { collectPromptEntries, renderPromptEntries } from '../prompts-yml.ts';

describe(collectPromptEntries, () => {
  let skillsDir: string;

  beforeEach(async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    skillsDir = path.join(tmpdir(), `agents-test-collect-${stamp}`);
    await mkdir(skillsDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(skillsDir, { recursive: true, force: true });
  });

  /** Writes a fixture skill directory with the given frontmatter line(s) into the temp skills dir. */
  async function writeSkill(name: string, frontmatter: string): Promise<void> {
    const dir = path.join(skillsDir, name);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'SKILL.md'), `---\nname: ${name}\n${frontmatter}\n---\n\n# ${name}\n`, 'utf8');
  }

  it('returns undefined when the skills directory is absent', async () => {
    expect(await collectPromptEntries(path.join(skillsDir, 'missing'))).toBeUndefined();
  });

  it('collects user-invocable skills sorted by name, with content-file paths and unquoted descriptions', async () => {
    await writeSkill('beta', "description: 'Beta does things'");
    await writeSkill('alpha', 'description: Alpha desc');

    expect(await collectPromptEntries(skillsDir)).toEqual([
      { name: 'alpha', description: 'Alpha desc', contentFile: 'skills/alpha/SKILL.md' },
      { name: 'beta', description: 'Beta does things', contentFile: 'skills/beta/SKILL.md' },
    ]);
  });

  it('excludes skills marked user-invocable: false', async () => {
    await writeSkill('internal', 'user-invocable: false');
    await writeSkill('public', 'description: Public');

    const entries = await collectPromptEntries(skillsDir);

    expect(entries?.map((entry) => entry.name)).toEqual(['public']);
  });
});

describe(renderPromptEntries, () => {
  it('returns an empty string when there are no entries', () => {
    expect(renderPromptEntries([])).toBe('');
  });

  it('renders entries as indented list items, headerless, with a trailing newline', () => {
    expect(
      renderPromptEntries([
        { name: 'alpha', description: 'Alpha desc', contentFile: 'skills/alpha/SKILL.md' },
        { name: 'beta', description: 'Beta does things', contentFile: 'skills/beta/SKILL.md' },
      ]),
    ).toBe(
      "  - name: 'alpha'\n    description: 'Alpha desc'\n    content_file: skills/alpha/SKILL.md\n" +
        "  - name: 'beta'\n    description: 'Beta does things'\n    content_file: skills/beta/SKILL.md\n",
    );
  });

  it('single-quotes descriptions with internal quotes doubled', () => {
    expect(renderPromptEntries([{ name: 'q', description: "it's fine", contentFile: 'skills/q/SKILL.md' }])).toContain(
      "description: 'it''s fine'",
    );
  });
});
