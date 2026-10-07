import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { findInstalledPackage } from '../lib/find-installed-package.ts';
import { isEnoent } from '../lib/type-guards.ts';

/** Canonical mapping from commit type keys to the label names that a tracker uses. */
const TYPE_MAP: Readonly<Record<string, string>> = {
  ai: 'ai',
  ci: 'ci',
  deprecate: 'deprecation',
  deps: 'dependencies',
  docs: 'documentation',
  drop: 'removal',
  feat: 'feature',
  fix: 'fix',
  fmt: 'formatting',
  internal: 'internal',
  perf: 'performance',
  refactor: 'refactoring',
  sec: 'security',
  tests: 'tests',
  tooling: 'tooling',
};

const CHANGE_GRAMMAR_PACKAGE_NAME = '@williamthorsen/change-grammar';
const RELEASE_KIT_PACKAGE_NAME = '@williamthorsen/release-kit';

interface GenerateLabelMapOptions {
  readonly force: boolean;
}

/** Builds the `$schema` URL of the label-map schema published with `change-grammar` at `version`. */
function buildSchemaUrl(version: string): string {
  return `https://github.com/williamthorsen/node-monorepo-tools/raw/change-grammar-v${version}/packages/change-grammar/schemas/label-map.json`;
}

/**
 * Derives scope entries from `packages/` subdirectories in the given working directory.
 * Returns an empty record if `packages/` does not exist.
 */
async function deriveScopes(workingDir: string): Promise<Record<string, string>> {
  const packagesDir = path.join(workingDir, 'packages');

  let entries: ReadonlyArray<string>;
  try {
    entries = await readdir(packagesDir);
  } catch (error: unknown) {
    if (isEnoent(error)) {
      return {};
    }
    throw error;
  }

  const scopes: Record<string, string> = {};

  for (const entry of entries) {
    const entryPath = path.join(packagesDir, entry);
    const entryStat = await stat(entryPath);
    if (entryStat.isDirectory()) {
      scopes[entry] = `scope:${entry}`;
    }
  }

  if (Object.keys(scopes).length > 0) {
    scopes.root = 'scope:root';
  }

  return scopes;
}

/**
 * Reads the version of `@williamthorsen/change-grammar` that the installed release-kit depends on.
 *
 * The label map is consumed by release-kit, so the schema must match the `change-grammar` that release-kit
 * resolves, which is found by searching from release-kit's real location rather than from this package.
 */
export async function readChangeGrammarVersion(
  startDir: string = path.dirname(fileURLToPath(import.meta.url)),
): Promise<string> {
  const releaseKit = await findInstalledPackage(RELEASE_KIT_PACKAGE_NAME, startDir);
  const changeGrammar = await findInstalledPackage(CHANGE_GRAMMAR_PACKAGE_NAME, releaseKit.directory);
  return changeGrammar.version;
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

  const version = await readChangeGrammarVersion();
  const scopes = await deriveScopes(cwd);

  const labelMap = {
    $schema: buildSchemaUrl(version),
    types: { ...TYPE_MAP },
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
