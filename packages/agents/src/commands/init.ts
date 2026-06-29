import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import type { InstallOptions } from '../lib/types.ts';

const DECLARATION_TEMPLATE = `# CodeAssembly project declaration. Opt into shared artifacts here, then run \`codeassembly-agents sync\`.
#
# rulebooks.use lists the rulebook slugs this project adopts. Each is materialized under .agents/ and, per its
# delivery mode, inlined into PROJECT.md and/or delivered as a consult-<slug> skill.
rulebooks:
  use: []
  # drop: []  # remove a rulebook inherited from a broader-scope declaration

# skills.use lists the skill slugs this project adopts. Each declared skill is deployed into the
# project's harness skills dirs.
# skills:
#   use: []

# subagents.use lists the subagent slugs this project adopts. Each declared subagent is deployed
# into the project's harness subagents dirs.
# subagents:
#   use: []

# root: true  # ignore broader-scope declarations entirely, starting fresh from this file

# Accepted now for forward compatibility; deployment lands in a later release:
# collections:
#   use: []
`;

/**
 * Scaffolds a project-scope `.agents/codeassembly.yaml` with an empty rulebooks declaration, creating `.agents/`
 * if absent. Refuses to overwrite an existing file. Honors `--dry-run` by reporting the intended action without
 * writing.
 *
 * @param projectRoot The project to scaffold (defaults to the current directory).
 */
export async function initCommand(options: InstallOptions, projectRoot: string = process.cwd()): Promise<void> {
  const declarationPath = path.join(projectRoot, '.agents', 'codeassembly.yaml');
  const alreadyExists = existsSync(declarationPath);

  if (options.dryRun) {
    console.info(
      alreadyExists
        ? `[dry-run] ${declarationPath} already exists; init would refuse to overwrite it.`
        : `[dry-run] init would create ${declarationPath}.`,
    );
    return;
  }

  if (alreadyExists) {
    throw new Error(`A codeassembly.yaml already exists at ${declarationPath}; refusing to overwrite it.`);
  }

  await mkdir(path.dirname(declarationPath), { recursive: true });
  await writeFile(declarationPath, DECLARATION_TEMPLATE, 'utf8');
  console.info(`Created ${declarationPath}`);
}
