import { mkdir, readdir, realpath, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { CANONICAL_TAXONOMY, deriveLabelMap } from '@williamthorsen/change-grammar';
import { type EmptyWorkspaceCause, resolveWorkspace } from '@williamthorsen/nmr-core/workspace';

import { findInstalledPackage, type InstalledPackage } from '../lib/find-installed-package.ts';
import { isEnoent, isRecord } from '../lib/type-guards.ts';

const CHANGE_GRAMMAR_PACKAGE_NAME = '@williamthorsen/change-grammar';
const RELEASE_KIT_PACKAGE_NAME = '@williamthorsen/release-kit';

interface GenerateLabelMapOptions {
  readonly force: boolean;
}

interface ScopeSource {
  readonly isMonorepo: boolean;
  readonly workspaces: readonly string[];
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
  const version = isRecord(changeGrammar.manifest) ? changeGrammar.manifest['version'] : undefined;
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

  const { isMonorepo, workspaces } = await resolveScopeSource(cwd);
  const version = await readChangeGrammarVersion(cwd);
  const { scopes, types } = deriveLabelMap(CANONICAL_TAXONOMY, workspaces, { isMonorepo });

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
  label-map   Generate .meta/label-map.json with type and scope mappings; the scopes
              are the workspaces that pnpm-workspace.yaml declares, or the
              directories under packages/ when it declares none; root is the
              only scope when its packages list matches no workspace

Options:
  --force      Overwrite an existing file`);
}

// region | Helpers

/** Builds the `$schema` URL of the label-map schema published with `change-grammar` at `version`. */
function buildSchemaUrl(version: string): string {
  return `https://github.com/williamthorsen/node-monorepo-tools/raw/change-grammar-v${version}/packages/change-grammar/schemas/label-map.json`;
}

/** Describes why a workspace manifest that declares patterns resolved to no workspace. */
function describeEmptyCause(cause: Exclude<EmptyWorkspaceCause, 'no-packages-list'>): string {
  switch (cause) {
    case 'all-excluded':
      return 'its exclusions remove every match';
    case 'no-package':
      return 'no matched directory contains a package.json';
    case 'no-pattern':
      return 'it does not declare a positive pattern';
    case 'unreadable-manifest':
      return 'the file cannot be parsed';
    case 'unreadable-packages':
      return '`packages` is not a list of strings';
  }
}

/** Finds the installed package `name` from `baseDir`, throwing when no candidate directory contains it. */
async function findRequiredPackage(name: string, baseDir: string): Promise<InstalledPackage> {
  const installed = await findInstalledPackage(name, baseDir);
  if (installed === undefined) {
    throw new Error(`Could not locate package.json for ${name}`);
  }
  return installed;
}

/** Describes a workspace manifest that resolves to no workspace, naming the cause and any declared patterns. */
function describeEmptyResolution(
  cause: Exclude<EmptyWorkspaceCause, 'no-packages-list'>,
  patterns: readonly string[],
): string {
  const patternList = patterns.map((pattern) => `\`${pattern}\``).join(', ');
  const patternSentence = patternList === '' ? '' : ` Declared patterns: ${patternList}.`;
  return `pnpm-workspace.yaml does not resolve to any workspace (${describeEmptyCause(cause)}).${patternSentence}`;
}

/** Lists the names of the directories under `packages/` in `workingDir`, sorted, or none when `packages/` is absent. */
async function listPackagesDirectoryNames(workingDir: string): Promise<string[]> {
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

/** Lists the directories under `packages/` as the scope source, a monorepo only when the listing is non-empty. */
async function listPackagesDirectoryScopes(workingDir: string): Promise<ScopeSource> {
  const workspaces = await listPackagesDirectoryNames(workingDir);
  return { isMonorepo: workspaces.length > 0, workspaces };
}

/**
 * Resolves the workspace names that become scopes in `workingDir`, sorted and without duplicates, excluding the
 * workspace root, and whether the repo is a monorepo.
 *
 * A `packages` list in `pnpm-workspace.yaml` makes the repo a monorepo, with a warning when the list resolves to no
 * workspace. Falls back to the directories under `packages/` when the manifest is absent or does not declare a
 * `packages` list, and exits with an error when the manifest or its `packages` value cannot be read.
 */
async function resolveScopeSource(workingDir: string): Promise<ScopeSource> {
  const resolution = resolveWorkspace(workingDir);

  if (resolution.kind === 'not-a-workspace') {
    return listPackagesDirectoryScopes(workingDir);
  }

  if (resolution.kind === 'empty') {
    const { cause, patterns } = resolution;
    switch (cause) {
      case 'no-packages-list':
        return listPackagesDirectoryScopes(workingDir);
      case 'all-excluded':
      case 'no-package':
      case 'no-pattern':
        console.error(`Warning: ${describeEmptyResolution(cause, patterns)} Writing \`root\` as the only scope.`);
        return { isMonorepo: true, workspaces: [] };
      case 'unreadable-manifest':
      case 'unreadable-packages':
        console.error(`Error: ${describeEmptyResolution(cause, patterns)}`);
        process.exit(1);
    }
  }

  const rootDir = path.resolve(workingDir);
  const names = resolution.packageDirs
    .filter((packageDir) => packageDir !== rootDir)
    .map((packageDir) => path.basename(packageDir));
  return { isMonorepo: true, workspaces: [...new Set(names)].toSorted() };
}

// endregion | Helpers
