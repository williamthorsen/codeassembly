import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import type { InstallOptions } from '../lib/types.ts';

const PROJECT_DECLARATION_TEMPLATE = `# CodeAssembly project declaration. Opt into shared artifacts here, then run \`codeassembly sync\`.
#
# harnesses.use pins the harnesses this project targets, by id (claude, rovo). Declare none and sync targets
# whichever harnesses are installed on this machine; use drop to withdraw one for this project alone.
# harnesses:
#   use: []

# rulebooks.use lists the rulebook slugs this project adopts. Per its delivery mode, each is injected into the
# ambient region of every targeted harness's machine-local project guidance file (CLAUDE.local.md, AGENTS.local.md)
# and/or delivered as a consult-<slug> skill.
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
# harnesses.use pins the harnesses every sync on this machine targets, by id (claude, rovo). Declare none and sync
# targets whichever are installed here. A project may add to this set, but only its own gitignored
# codeassembly.local.yaml can withdraw from it.
# harnesses:
#   use: []
#
# Each collection carries a claim about its members: \`recommended\` is vetted and generally applicable, and
# \`triage\` holds what nobody has examined yet. Add any other collection the library or a source ships, or declare
# \`all\` in their place to take the whole catalog, including the artifacts every collection deliberately omits.
collections:
  use:
    - recommended
    - triage
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
