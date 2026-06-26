import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { parseFrontmatter } from './frontmatter-merger.ts';
import { isEnoent, isMissingFile } from './type-guards.ts';

/** One entry in the rendered index: a user-invocable skill paired with its description and content file. */
interface PromptEntry {
  readonly name: string;
  readonly description: string;
  readonly contentFile: string;
}

/**
 * Renders the Rovo Dev `prompts.yml` index for the skills under `skillsDir`: one entry per skill directory, sorted by
 * name, excluding any whose `SKILL.md` declares `user-invocable: false`. Returns `undefined` when the directory is
 * absent. A pure projection of the on-disk skills dir — install and sync produce byte-identical output, so either may
 * regenerate it.
 */
export async function renderPromptsYml(skillsDir: string): Promise<string | undefined> {
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

  return renderYaml(promptEntries);
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

/** Builds the deterministic `prompts.yml` body, single-quoting descriptions with internal quotes doubled. */
function renderYaml(promptEntries: ReadonlyArray<PromptEntry>): string {
  const yamlLines = ['prompts:'];
  for (const entry of promptEntries) {
    yamlLines.push(
      `  - name: '${entry.name}'`,
      `    description: '${entry.description.replaceAll("'", "''")}'`,
      `    content_file: ${entry.contentFile}`,
    );
  }
  return yamlLines.join('\n') + '\n';
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
