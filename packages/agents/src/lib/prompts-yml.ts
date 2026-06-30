import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { parseFrontmatter } from './frontmatter-merger.ts';
import { isEnoent, isMissingFile } from './type-guards.ts';

/** One entry in the rendered index: a user-invocable skill paired with its description and content file. */
export interface PromptEntry {
  readonly name: string;
  readonly description: string;
  readonly contentFile: string;
}

/**
 * Scans the skills under `skillsDir` into the prompt entries that back the Rovo Dev index: one entry per skill
 * directory, sorted by name, excluding any whose `SKILL.md` declares `user-invocable: false`. Returns `undefined`
 * when the directory is absent. The shared projection both the whole-file and region renderers build on.
 */
export async function collectPromptEntries(skillsDir: string): Promise<ReadonlyArray<PromptEntry> | undefined> {
  let skillDirEntries: ReadonlyArray<string>;
  try {
    skillDirEntries = await readdir(skillsDir);
  } catch (error: unknown) {
    if (isEnoent(error)) {
      return undefined;
    }
    throw error;
  }

  const promptEntries: Array<PromptEntry> = [];
  for (const skillName of [...skillDirEntries].toSorted()) {
    let skillContent: string;
    try {
      skillContent = await readFile(path.join(skillsDir, skillName, 'SKILL.md'), 'utf8');
    } catch (error: unknown) {
      // Tolerate any non-skill entry: a regular file raises ENOTDIR on the SKILL.md read-through, a dir without a
      // SKILL.md raises ENOENT. Either way it is not a skill and is skipped.
      if (isMissingFile(error)) {
        continue;
      }
      throw error;
    }

    const { userInvocable, description } = readPromptMetadata(skillContent);
    if (!userInvocable) {
      continue;
    }
    promptEntries.push({ name: skillName, description, contentFile: `skills/${skillName}/SKILL.md` });
  }

  return promptEntries;
}

/**
 * Renders the prompt entries as the indented `- name/description/content_file` list items — no `prompts:` header —
 * single-quoting descriptions with internal quotes doubled. Returns an empty string for no entries. This is the body
 * the whole-file renderer prefixes with `prompts:` and the region renderer wraps in sentinels.
 */
export function renderPromptEntries(entries: ReadonlyArray<PromptEntry>): string {
  const yamlLines: Array<string> = [];
  for (const entry of entries) {
    yamlLines.push(
      `  - name: '${entry.name}'`,
      `    description: '${entry.description.replaceAll("'", "''")}'`,
      `    content_file: ${entry.contentFile}`,
    );
  }
  return yamlLines.length === 0 ? '' : yamlLines.join('\n') + '\n';
}

// region | Helpers

/** Reads a skill's `user-invocable` (default true) and `description` (default empty) from its frontmatter lines. */
function readPromptMetadata(skillContent: string): { userInvocable: boolean; description: string } {
  const { lines } = parseFrontmatter(skillContent);
  let userInvocable = true;
  let description = '';
  for (const line of lines) {
    if (line.startsWith('user-invocable:')) {
      userInvocable = line.slice('user-invocable:'.length).trim() !== 'false';
    }
    if (line.startsWith('description:')) {
      description = unquoteYamlScalar(line.slice('description:'.length).trim());
    }
  }
  return { userInvocable, description };
}

/** Strips surrounding single or double quotes from a YAML scalar, unescaping the doubled or backslash forms. */
function unquoteYamlScalar(value: string): string {
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replaceAll("''", "'");
  }
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replaceAll(String.raw`\"`, '"');
  }
  return value;
}

// endregion | Helpers
