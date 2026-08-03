import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import type { InstallOptions } from '../lib/types.ts';

const PROJECT_DECLARATION_TEMPLATE = `# CodeAssembly project declaration. Opt into shared artifacts here, then run \`codeassembly sync\`.
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

# sources declares extra content directories to resolve artifacts from, each a { name, path } pair searched
# before the built-in library. A relative path resolves against this .agents/ directory (~ and absolute paths are
# also allowed); a later-declared source shadows an earlier one, and any source shadows the library. Commit only
# repo-relative paths here; keep machine-specific paths in codeassembly.local.yaml. Sources resolve every artifact
# type — rulebooks, skills, subagents, and collections.
# sources:
#   - name: org-guidance
#     path: ../shared-guidance

# root: true  # ignore broader-scope declarations entirely (including sources), starting fresh from this file

# collections.use lists collection slugs; each pulls in its members' transitive closure.
# collections:
#   use: []
`;

const GLOBAL_DECLARATION_TEMPLATE = `# CodeAssembly user-global declaration. Opt into shared artifacts for every project here, then run
# \`codeassembly sync --global\`. Created once by \`init --global\`; the tool never overwrites it.
#
# \`all\` is the full catalog — every rulebook, skill, and subagent. Replace it with a narrower collection or an
# explicit member list to trim what deploys.
collections:
  use:
    - all
`;

/**
 * Scaffolds a project-scope `.agents/codeassembly.yaml` seeded with an empty rulebooks declaration.
 *
 * @param projectRoot The project to scaffold (defaults to the current directory).
 */
export async function initCommand(options: InstallOptions, projectRoot: string = process.cwd()): Promise<void> {
  await scaffoldDeclaration(
    path.join(projectRoot, '.agents', 'codeassembly.yaml'),
    PROJECT_DECLARATION_TEMPLATE,
    options,
  );
}

/**
 * Scaffolds the user-global `~/.agents/codeassembly.yaml` seeded with the `all` collection, so `sync --global`
 * deploys the whole catalog into the home harness dirs.
 *
 * @param homeDir The home directory to scaffold under (defaults to the OS home dir; injected in tests).
 */
export async function initGlobalCommand(options: InstallOptions, homeDir: string = homedir()): Promise<void> {
  await scaffoldDeclaration(path.join(homeDir, '.agents', 'codeassembly.yaml'), GLOBAL_DECLARATION_TEMPLATE, options);
}

/**
 * Writes `template` to `declarationPath`, creating its parent directory if absent. Refuses to overwrite an existing
 * file. Honors `--dry-run` by reporting the intended action without writing.
 */
async function scaffoldDeclaration(declarationPath: string, template: string, options: InstallOptions): Promise<void> {
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
  await writeFile(declarationPath, template, 'utf8');
  console.info(`Created ${declarationPath}`);
}
