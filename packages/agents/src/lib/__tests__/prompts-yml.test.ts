import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { renderPromptsYml } from '../prompts-yml.ts';

describe(renderPromptsYml, () => {
  let skillsDir: string;

  beforeEach(async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    skillsDir = path.join(tmpdir(), `agents-test-prompts-${stamp}`);
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
    expect(await renderPromptsYml(path.join(skillsDir, 'missing'))).toBeUndefined();
  });

  it('lists user-invocable skills sorted by name, unquoting descriptions', async () => {
    await writeSkill('beta', "description: 'Beta does things'");
    await writeSkill('alpha', 'description: Alpha desc');

    const yaml = await renderPromptsYml(skillsDir);

    expect(yaml).toBe(
      'prompts:\n' +
        "  - name: 'alpha'\n    description: 'Alpha desc'\n    content_file: skills/alpha/SKILL.md\n" +
        "  - name: 'beta'\n    description: 'Beta does things'\n    content_file: skills/beta/SKILL.md\n",
    );
  });

  it('excludes skills marked user-invocable: false', async () => {
    await writeSkill('internal', 'user-invocable: false');
    await writeSkill('public', 'description: Public');

    const yaml = await renderPromptsYml(skillsDir);

    expect(yaml).toContain("name: 'public'");
    expect(yaml).not.toContain('internal');
  });
});
