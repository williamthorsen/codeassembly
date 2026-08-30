import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { resolveHarnessPaths } from '../../../lib/harness.ts';
import type { HarnessId } from '../../../lib/types.ts';

/** Resolves one harness's deployed dirs under `baseDir`, creating them so a test can write into them directly. */
export async function scaffoldHarnessTree(
  harnessId: HarnessId,
  baseDir: string,
): Promise<{ harnessHome: string; skillsDir: string; subagentsDir: string }> {
  const { harnessHome, skillsDir, subagentsDir } = resolveHarnessPaths(harnessId, baseDir);
  await mkdir(skillsDir, { recursive: true });
  await mkdir(subagentsDir, { recursive: true });
  return { harnessHome, skillsDir, subagentsDir };
}

/** Writes a skill dir whose `SKILL.md` carries the declared-skill ownership marker. */
export async function writeDeclaredSkill(skillsDir: string, slug: string): Promise<string> {
  return writeSkillFile(skillsDir, slug, `<!-- codeassembly-skill:${slug} -->`);
}

/** Writes a skill dir whose `SKILL.md` carries no ownership marker, standing in for hand-authored content. */
export async function writeForeignSkill(skillsDir: string, dir: string): Promise<string> {
  return writeSkillFile(skillsDir, dir, '');
}

/** Writes a subagent file carrying no ownership marker, standing in for hand-authored content. */
export async function writeForeignSubagent(subagentsDir: string, slug: string): Promise<string> {
  return writeSubagentFile(subagentsDir, slug, '');
}

/** Writes a skill dir whose `SKILL.md` carries a rulebook-delivered skill's ownership marker. */
export async function writeRulebookSkill(skillsDir: string, dir: string, slug: string): Promise<string> {
  return writeSkillFile(skillsDir, dir, `<!-- codeassembly-rulebook:${slug} -->`);
}

/** Writes one source's support entry under the harness's `_sources` namespace root. */
export async function writeSourceSupport(skillsDir: string, source: string, fileName: string): Promise<string> {
  const dir = path.join(skillsDir, '_sources', source);
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, fileName);
  await writeFile(filePath, 'support content\n', 'utf8');
  return filePath;
}

/** Writes a subagent file carrying the subagent ownership marker. */
export async function writeSubagent(subagentsDir: string, slug: string): Promise<string> {
  return writeSubagentFile(subagentsDir, slug, `<!-- codeassembly-subagent:${slug} -->`);
}

// region | Helpers

/** Writes `<skillsDir>/<dir>/SKILL.md` carrying `marker` beneath a frontmatter block. */
async function writeSkillFile(skillsDir: string, dir: string, marker: string): Promise<string> {
  const skillDir = path.join(skillsDir, dir);
  await mkdir(skillDir, { recursive: true });
  await writeFile(path.join(skillDir, 'SKILL.md'), `---\nname: ${dir}\n---\n${marker}\n\n# ${dir}\n`, 'utf8');
  return skillDir;
}

/** Writes `<subagentsDir>/<slug>.md` carrying `marker` beneath a frontmatter block. */
async function writeSubagentFile(subagentsDir: string, slug: string, marker: string): Promise<string> {
  await mkdir(subagentsDir, { recursive: true });
  const filePath = path.join(subagentsDir, `${slug}.md`);
  await writeFile(filePath, `---\nname: ${slug}\n---\n${marker}\n\n# ${slug}\n`, 'utf8');
  return filePath;
}

// endregion | Helpers
