import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

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
  internal: 'utility',
  perf: 'performance',
  refactor: 'refactoring',
  sec: 'security',
  tests: 'tests',
  tooling: 'tooling',
};

interface GenerateLabelMapOptions {
  readonly force: boolean;
}

/**
 * Builds the `$schema` URL for the label-map JSON file using the agents package version.
 */
function buildSchemaUrl(version: string): string {
  return `https://github.com/williamthorsen/codeassembly/raw/agents-v${version}/packages/agents/schemas/label-map.json`;
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
  let hasSubdirectory = false;

  for (const entry of entries) {
    const entryPath = path.join(packagesDir, entry);
    const entryStat = await stat(entryPath);
    if (entryStat.isDirectory()) {
      hasSubdirectory = true;
      scopes[entry] = `scope:${entry}`;
    }
  }

  // Include root scope only when at least one package subdirectory exists (monorepo).
  if (hasSubdirectory) {
    scopes['root'] = 'scope:root';
  }

  return scopes;
}

/**
 * Reads the agents package version from `package.json`.
 */
async function readPackageVersion(): Promise<string> {
  const packageJsonPath = new URL('../../package.json', import.meta.url);
  const raw = await readFile(packageJsonPath, 'utf8');
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null || !('version' in parsed)) {
    throw new Error('Unable to read version from package.json');
  }
  const version = (parsed as { version: unknown }).version;
  if (typeof version !== 'string') {
    throw new Error('Invalid version field in package.json');
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

  const version = await readPackageVersion();
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

/**
 * Type guard that checks whether an error is a Node.js ENOENT error.
 */
function isEnoent(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
