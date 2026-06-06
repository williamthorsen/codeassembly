import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import type { InstallOptions } from '../lib/types.ts';

const MANIFEST_TEMPLATE = `# Rulebooks this project opts into. List slugs under \`rulebooks:\`, then run \`codeassembly-agents sync\`.
rulebooks: []
`;

/**
 * Scaffolds a project-scope `.agents/rulebooks.yaml` with an empty declaration, creating `.agents/` if absent.
 * Refuses to overwrite an existing file. Honors `--dry-run` by reporting the intended action without writing.
 *
 * @param projectRoot The project to scaffold (defaults to the current directory).
 */
export async function initCommand(options: InstallOptions, projectRoot: string = process.cwd()): Promise<void> {
  const manifestPath = path.join(projectRoot, '.agents', 'rulebooks.yaml');
  const alreadyExists = existsSync(manifestPath);

  if (options.dryRun) {
    console.info(
      alreadyExists
        ? `[dry-run] ${manifestPath} already exists; init would refuse to overwrite it.`
        : `[dry-run] init would create ${manifestPath}.`,
    );
    return;
  }

  if (alreadyExists) {
    throw new Error(`A rulebooks.yaml already exists at ${manifestPath}; refusing to overwrite it.`);
  }

  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, MANIFEST_TEMPLATE, 'utf8');
  console.info(`Created ${manifestPath}`);
}
