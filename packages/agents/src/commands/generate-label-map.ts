import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { pathExists } from '@codeassembly/kb-core/filesystem';

import { isEnoent, isRecord } from '../lib/type-guards.ts';

/** Canonical mapping from commit type keys to human-readable label values. */
const TYPE_MAP: Readonly<Record<string, string>> = {
  ai: 'ai',
  ci: 'ci',
  deprecate: 'deprecate',
  deps: 'dependencies',
  docs: 'documentation',
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

const RELEASE_KIT_PACKAGE_NAME = '@williamthorsen/release-kit';

interface GenerateLabelMapOptions {
  readonly force: boolean;
}

/**
 * Builds the `$schema` URL for the label-map JSON file using the installed release-kit version.
 */
function buildSchemaUrl(version: string): string {
  return `https://github.com/williamthorsen/node-monorepo-tools/raw/release-kit-v${version}/packages/release-kit/schemas/label-map.json`;
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

  // Include root scope only when at least one package subdirectory exists (monorepo).
  if (Object.keys(scopes).length > 0) {
    scopes.root = 'scope:root';
  }

  return scopes;
}

/**
 * Reads the installed `@williamthorsen/release-kit` version by walking up from this
 * module's location, looking for `node_modules/@williamthorsen/release-kit/package.json`
 * at each level — the same algorithm Node's own module resolver uses.
 *
 * A direct `require.resolve` is unsuitable because release-kit's `exports` map does not
 * expose `./package.json` and only declares the `import` condition for its main entry.
 * The walk handles pnpm hoisting (release-kit may live at the workspace root rather than
 * as a sibling of the agents package) and works in both dev (`src/`) and built
 * (`dist/esm/`) layouts.
 */
export async function readReleaseKitVersion(): Promise<string> {
  const thisDir = path.dirname(fileURLToPath(import.meta.url));

  let dir = thisDir;
  for (;;) {
    const candidate = path.join(dir, 'node_modules', '@williamthorsen', 'release-kit', 'package.json');
    if (await pathExists(candidate, { treatErrorsAsAbsent: true })) {
      const raw = await readFile(candidate, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      if (isReleaseKitPackageJson(parsed)) {
        return parsed.version;
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(`Could not locate package.json for ${RELEASE_KIT_PACKAGE_NAME}`);
    }
    dir = parent;
  }
}

/** Type guard: `value` is release-kit's `package.json` (matches name and has a string `version`). */
function isReleaseKitPackageJson(value: unknown): value is { readonly name: string; readonly version: string } {
  return isRecord(value) && value.name === RELEASE_KIT_PACKAGE_NAME && typeof value.version === 'string';
}

/**
 * Generates `.meta/label-map.json` in the given working directory.
 * Refuses to overwrite an existing file unless `force` is true.
 */
export async function generateLabelMap(options: GenerateLabelMapOptions, workingDir?: string): Promise<void> {
  const cwd = workingDir ?? process.cwd();
  const outputDir = path.join(cwd, '.meta');
  const outputPath = path.join(outputDir, 'label-map.json');

  // Check for existing file.
  if (!options.force) {
    try {
      await stat(outputPath);
      console.error(`Error: ${outputPath} already exists. Use --force to overwrite.`);
      process.exit(1);
    } catch (error: unknown) {
      if (!isEnoent(error)) {
        throw error;
      }
      // File does not exist — proceed.
    }
  }

  const version = await readReleaseKitVersion();
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
  console.info(`Usage: codeassembly-agents generate <target> [options]

Targets:
  label-map   Generate .meta/label-map.json with type and scope mappings

Options:
  --force      Overwrite an existing file`);
}
