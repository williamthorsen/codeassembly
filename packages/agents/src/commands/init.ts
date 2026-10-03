import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import type { InstallOptions } from '../lib/types.ts';

const PROJECT_DECLARATION_TEMPLATE = `# CodeAssembly project declaration. Opt into shared artifacts here, then run \`codeassembly sync\`.
#
# harnesses.use pins the harnesses that this project targets, by id (claude, rovo). Omit this key and sync targets
# whichever harnesses are installed for this user; an empty list targets none. Use drop to withdraw a harness
# declared by a broader tier.
# harnesses:
#   use: [claude]

# rulebooks.use lists the rulebook slugs that this project adopts. Per its delivery mode, each is injected into the
# ambient region of every targeted harness's machine-local project guidance file (CLAUDE.local.md, AGENTS.local.md)
# and/or delivered as a consult-<slug> skill.
rulebooks:
  use: []
  # drop: []  # remove a rulebook inherited from a broader-scope declaration

# skills.use lists the skill slugs that this project adopts. Each declared skill is deployed into the
# project's harness skills dirs.
# skills:
#   use: []

# subagents.use lists the subagent slugs that this project adopts. Each declared subagent is deployed
# into the project's harness subagents dirs.
# subagents:
#   use: []

# sources declares the content directories from which artifacts resolve, each a { name, path } pair. sync resolves
# from these and from the packages declared under packages: alone, and stops when neither declares a usable source.
# A relative path resolves against this .agents/ directory (~ and absolute paths are also allowed); a later-declared
# source shadows an earlier one. Commit only repo-relative paths here; keep machine-specific paths in
# codeassembly.local.yaml. Sources resolve every artifact type: rulebooks, skills, subagents, and collections.
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
# harnesses.use pins the harnesses targeted by every sync for this user, by id (claude, rovo). Omit this key and sync
# targets whichever are installed here; an empty list targets none. A project may add to this set, and either
# project-tier file may withdraw from it with drop.
# harnesses:
#   use: [claude]
#
# sources declares the content directories from which artifacts resolve, each a { name, path } pair. install and
# sync --global resolve from these alone, and stop until one is declared. Clone the CodeAssembly repository, then
# uncomment the entry below and point its path at the clone's packages/guidance/content (~ and absolute paths are
# allowed; a relative path resolves against this .agents/ directory). A path that differs between machines belongs in
# codeassembly.local.yaml instead. A later-declared source shadows an earlier one.
# sources:
#   - name: codeassembly-guidance
#     path: ~/repos/codeassembly/packages/guidance/content
#
# Each collection makes a claim about its members: \`recommended\` is vetted and generally applicable, and \`triage\`
# holds what nobody has examined yet. Add any other collection shipped by a declared source, or declare \`all\` in
# their place to take the whole catalog, including the artifacts that every collection deliberately omits.
collections:
  use:
    - recommended
    - triage
`;

/**
 * Scaffolds a project-scope `.agents/codeassembly.yaml` seeded with an empty rulebooks declaration.
 */
export async function initCommand(options: InstallOptions, projectRoot: string = process.cwd()): Promise<void> {
  await scaffoldDeclaration(
    path.join(projectRoot, '.agents', 'codeassembly.yaml'),
    PROJECT_DECLARATION_TEMPLATE,
    options,
  );
}

/**
 * Scaffolds the user-global `~/.agents/codeassembly.yaml` seeded with the `recommended` and `triage` collections and a
 * commented `sources:` entry, which the user uncomments and points at a clone of the content before `install` and
 * `sync --global` deploy anything.
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
