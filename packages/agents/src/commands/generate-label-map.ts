import { mkdir, readdir, realpath, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { CANONICAL_TAXONOMY, deriveLabelMap } from '@williamthorsen/change-grammar';

import { findInstalledPackage, type InstalledPackage } from '../lib/find-installed-package.ts';
import { isEnoent, isRecord } from '../lib/type-guards.ts';

const CHANGE_GRAMMAR_PACKAGE_NAME = '@williamthorsen/change-grammar';
const RELEASE_KIT_PACKAGE_NAME = '@williamthorsen/release-kit';

interface GenerateLabelMapOptions {
  readonly force: boolean;
}

/** Builds the `$schema` URL of the label-map schema published with `change-grammar` at `version`. */
function buildSchemaUrl(version: string): string {
  return `https://github.com/williamthorsen/node-monorepo-tools/raw/change-grammar-v${version}/packages/change-grammar/schemas/label-map.json`;
}

/** Lists the names of the directories under `packages/` in `workingDir`, sorted, or none when `packages/` is absent. */
async function listWorkspaceNames(workingDir: string): Promise<string[]> {
  const packagesDir = path.join(workingDir, 'packages');

  let entries: ReadonlyArray<string>;
  try {
    entries = await readdir(packagesDir);
  } catch (error: unknown) {
    if (isEnoent(error)) {
      return [];
    }
    throw error;
  }

  const names: string[] = [];
  for (const entry of entries) {
    const entryStat = await stat(path.join(packagesDir, entry));
    if (entryStat.isDirectory()) {
      names.push(entry);
    }
  }
  return names.toSorted();
}

/** Finds the installed package `name` from `baseDir`, throwing when no candidate directory contains it. */
async function findRequiredPackage(name: string, baseDir: string): Promise<InstalledPackage> {
  const installed = await findInstalledPackage(name, baseDir);
  if (installed === undefined) {
    throw new Error(`Could not locate package.json for ${name}`);
  }
  return installed;
}

/**
 * Reads the version of `@williamthorsen/change-grammar` that the installed release-kit depends on.
 *
 * The label map is consumed by release-kit, so the schema must match the `change-grammar` that release-kit
 * resolves: release-kit is found from the project at `startDir`, and `change-grammar` from release-kit's real location.
 */
export async function readChangeGrammarVersion(startDir: string): Promise<string> {
  const releaseKit = await findRequiredPackage(RELEASE_KIT_PACKAGE_NAME, startDir);
  const changeGrammar = await findRequiredPackage(CHANGE_GRAMMAR_PACKAGE_NAME, await realpath(releaseKit.directory));
  const version = isRecord(changeGrammar.manifest) ? changeGrammar.manifest.version : undefined;
  if (typeof version !== 'string') {
    throw new TypeError(`package.json for ${CHANGE_GRAMMAR_PACKAGE_NAME} does not declare a string version`);
  }
  return version;
}

/**
 * Generates `.meta/label-map.json` in the given working directory.
 * Refuses to overwrite an existing file unless `force` is true.
 */
export async function generateLabelMap(options: GenerateLabelMapOptions, workingDir?: string): Promise<void> {
  const cwd = workingDir ?? process.cwd();
  const outputDir = path.join(cwd, '.meta');
  const outputPath = path.join(outputDir, 'label-map.json');

  if (!options.force) {
    try {
      await stat(outputPath);
      console.error(`Error: ${outputPath} already exists. Use --force to overwrite.`);
      process.exit(1);
    } catch (error: unknown) {
      if (!isEnoent(error)) {
        throw error;
      }
      // File does not exist; proceed.
    }
  }

  const version = await readChangeGrammarVersion(cwd);
  const { scopes, types } = deriveLabelMap(CANONICAL_TAXONOMY, await listWorkspaceNames(cwd));

  const labelMap = {
    $schema: buildSchemaUrl(version),
    types,
    scopes,
  };

  const content = JSON.stringify(labelMap, undefined, 2) + '\n';

  await mkdir(outputDir, { recursive: true });
  await writeFile(outputPath, content, 'utf8');

  console.info(outputPath);
}

/**
 * Prints usage information for the `generate` command.
 */
export function printGenerateUsage(): void {
  console.info(`Usage: codeassembly generate <target> [options]

Targets:
  label-map   Generate .meta/label-map.json with type and scope mappings

Options:
  --force      Overwrite an existing file`);
}
