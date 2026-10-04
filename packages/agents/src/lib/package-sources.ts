import { readFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

import { chainError } from '@williamthorsen/toolbelt.errors/candidate';
import { z } from 'zod';

import { isMissingFile } from './type-guards.ts';

/**
 * The only part of a dependency's `package.json` that CodeAssembly reads: the content directory that it declares. Both
 * levels are `.loose()` so that every other field passes through and a later cut can add per-package config without a
 * breaking change.
 */
const PackageManifestSchema = z
  .object({
    codeassembly: z
      .object({ content: z.string().min(1) })
      .loose()
      .optional(),
  })
  .loose();

/** The dependency fields of the consuming project's own `package.json`, read for the advisory scan alone. */
const ProjectManifestSchema = z
  .object({
    dependencies: z.record(z.string(), z.string()).optional(),
    devDependencies: z.record(z.string(), z.string()).optional(),
  })
  .loose();

/** A declared package resolved to the content directory that it ships, named by the package from which it came. */
export interface PackageSource {
  readonly name: string;
  readonly dir: string;
}

/**
 * Reads the content directory declared by a package manifest under `codeassembly.content`, or `undefined` when the
 * key is absent. A malformed `codeassembly` key still throws, naming the package: Absence is a package that does not
 * ship any content, which some callers answer for themselves, but a key that is present and wrong is a defect either
 * way.
 */
export function findContentPath(name: string, manifest: unknown): string | undefined {
  const result = PackageManifestSchema.safeParse(manifest);
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Package "${name}" declares an invalid "codeassembly" key: ${detail}.`);
  }
  return result.data.codeassembly?.content;
}

/**
 * Reports the direct dependencies of the project at `baseDir` that ship CodeAssembly content and are absent from
 * `addressed`, sorted by name, so that a caller can name the declaration that would adopt each. `addressed` lists
 * every name that the project has spoken about, adopted and declined alike, so a package that a project turned down
 * is not reported. Purely advisory: It does not contribute any source and cannot fail a run. An unreadable or absent
 * `package.json` yields nothing, which also lets the home domain share this path without a carve-out. Because a
 * package must declare its content directory to ship any, detection reads that declaration and cannot report a false
 * positive.
 */
export async function findUndeclaredGuidancePackages(
  addressed: ReadonlyArray<string>,
  baseDir: string,
): Promise<ReadonlyArray<string>> {
  try {
    const addressedNames = new Set(addressed);
    const candidates = (await readDirectDependencies(baseDir)).filter((name) => !addressedNames.has(name));
    const shipping = await Promise.all(
      candidates.map(async (name) => ((await shipsGuidance(name, baseDir)) ? name : undefined)),
    );
    return shipping.filter((name): name is string => name !== undefined).toSorted((a, b) => a.localeCompare(b));
  } catch {
    // A suggestion is never worth failing a run for, so any surprise here yields an empty list rather than an error.
    return [];
  }
}

/**
 * Reports whether a declared package name is a filesystem path rather than a package name. Node's resolver returns the
 * anchor directory itself for a relative specifier, so `./guidance` would resolve to `<baseDir>/guidance` and
 * `../sibling` would escape `baseDir` entirely.
 */
export function isFilesystemPath(name: string): boolean {
  return name.startsWith('.') || path.isAbsolute(name);
}

/**
 * Locates the installed directory of `name` by probing, in Node's search order from `baseDir`, for a candidate that
 * contains a `package.json`, or lists every searched candidate when none does. Checks existence only, so a package whose
 * manifest does not parse is still located.
 */
export async function locateInstalledPackage(
  name: string,
  baseDir: string,
): Promise<{ dir: string } | { searched: ReadonlyArray<string> }> {
  const candidates = listCandidateDirs(name, baseDir);
  for (const dir of candidates) {
    if (await pathExists(path.join(dir, 'package.json'))) {
      return { dir };
    }
  }
  return { searched: candidates };
}

/**
 * Resolves one installed package to the content directory that it ships. Resolution walks the `node_modules` chain
 * that Node itself would search from `baseDir`, so it holds under pnpm's symlinked layout and under `workspace:*`
 * links. Throws, opening each message with `label` so that the reader can tell which declaration to edit, when
 * `packageName` is a filesystem path rather than a package name, when the package is not installed, or when it does
 * not declare a content directory; whether that directory exists is left to the caller's source validation.
 */
export async function resolvePackageSource(packageName: string, baseDir: string, label: string): Promise<string> {
  assertPackageName(packageName, label);
  const installed = await findInstalledPackage(packageName, baseDir);
  if (installed === undefined) {
    throw new Error(`${label} is not installed. Searched: ${listCandidateDirs(packageName, baseDir).join(', ')}.`);
  }
  return path.join(installed.dir, readContentPath(packageName, installed.manifest));
}

/**
 * Resolves each declared package name to the content directory that it ships, in declaration order, for use as a
 * content source. A producing repo consumes its own guidance through a `workspace:*` link, by the same declaration
 * that a third party writes. Throws as `resolvePackageSource` does, labelling each failure with the declared package.
 */
export async function resolvePackageSources(
  names: ReadonlyArray<string>,
  baseDir: string,
): Promise<ReadonlyArray<PackageSource>> {
  const resolved: Array<PackageSource> = [];
  for (const name of names) {
    resolved.push({ name, dir: await resolvePackageSource(name, baseDir, `Declared package "${name}"`) });
  }
  return resolved;
}

// region | Helpers

/**
 * Throws when `name` is a filesystem path rather than a package name, which would otherwise make a package declaration
 * a second, undocumented route to a directory beside a `sources` entry's `path`.
 */
function assertPackageName(name: string, label: string): void {
  if (isFilesystemPath(name)) {
    throw new Error(
      `${label} is a filesystem path, not a package name. Point at a directory with a \`sources\` entry's \`path\` instead.`,
    );
  }
}

/**
 * Locates the installed directory of `name`, with its parsed `package.json`, by probing each candidate directory that
 * Node's resolver would search. Probes the filesystem rather than resolving a package subpath: A modern `exports` map
 * does not expose `./package.json`, so `require.resolve` cannot reach it, and a guidance-only package does not
 * have an importable entry to resolve instead.
 */
async function findInstalledPackage(
  name: string,
  baseDir: string,
): Promise<{ dir: string; manifest: unknown } | undefined> {
  for (const dir of listCandidateDirs(name, baseDir)) {
    const raw = await readFileIfPresent(path.join(dir, 'package.json'));
    if (raw !== undefined) {
      return { dir, manifest: parsePackageManifest(name, raw) };
    }
  }
  return;
}

/** Lists the candidate installed directories for `name`, in the order Node's resolver searches them from `baseDir`. */
function listCandidateDirs(name: string, baseDir: string): ReadonlyArray<string> {
  // `createRequire` needs only a path to anchor resolution; the file itself need not exist.
  const requireFromBase = createRequire(path.join(baseDir, 'package.json'));
  // `resolve.paths` returns null for a core module, which a garbage declaration can produce; an empty candidate list
  // reports it as not installed.
  return (requireFromBase.resolve.paths(name) ?? []).map((nodeModules) => path.join(nodeModules, name));
}

/** Parses JSON, resolving to `undefined` rather than throwing, for the advisory scan that must not fail a run. */
function parseJsonOrUndefined(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** Parses a package's `package.json` text, naming the package so that a syntax error is attributable. */
function parsePackageManifest(name: string, raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (error: unknown) {
    throw chainError(`Package "${name}" has an unreadable package.json`, error);
  }
}

/** Reports whether `filePath` exists. Rethrows any failure other than absence, as `readFileIfPresent` does. */
async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch (error: unknown) {
    if (isMissingFile(error)) {
      return false;
    }
    throw error;
  }
}

/**
 * Reads the content directory that a package declares under `codeassembly.content`. The key is required and does not
 * have a default: A default location would claim a directory name in every producer's package root, so a producer
 * states where its content lives and can nest it under a directory that it already owns. Throws when the key is
 * malformed or absent, naming the package either way.
 */
function readContentPath(name: string, manifest: unknown): string {
  const content = findContentPath(name, manifest);
  if (content === undefined) {
    throw new Error(
      `Package "${name}" does not declare any CodeAssembly content. A package that ships content sets "codeassembly": { "content": "<dir>" } in its package.json, and includes that directory in its published "files".`,
    );
  }
  return content;
}

/**
 * Reads the direct dependency names declared by the project at `baseDir`, or nothing when it does not have a readable
 * manifest. Direct dependencies only: Guidance is something a project opts into by depending on the package that ships
 * it, and pnpm's strict layout would not expose a transitive package at the probed paths anyway.
 */
async function readDirectDependencies(baseDir: string): Promise<ReadonlyArray<string>> {
  const raw = await readFileIfPresent(path.join(baseDir, 'package.json'));
  if (raw === undefined) {
    return [];
  }

  const result = ProjectManifestSchema.safeParse(parseJsonOrUndefined(raw));
  if (!result.success) {
    return [];
  }
  return [...Object.keys(result.data.dependencies ?? {}), ...Object.keys(result.data.devDependencies ?? {})];
}

/**
 * Reads `filePath`, resolving to `undefined` when it is absent. Rethrows any other failure (e.g. `EACCES` on an
 * unreadable `node_modules` directory), so a permission problem surfaces instead of reading as a bare absence and
 * sending resolution on to the next candidate.
 */
async function readFileIfPresent(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error: unknown) {
    if (isMissingFile(error)) {
      return undefined;
    }
    throw error;
  }
}

/**
 * Reports whether `name` resolves to an installed package that declares a content directory. Advisory: It returns
 * `false` for a package that is absent or whose `package.json` will not parse, rather than throwing, because the scan
 * that consumes this must never fail a run.
 */
async function shipsGuidance(name: string, baseDir: string): Promise<boolean> {
  try {
    const installed = await findInstalledPackage(name, baseDir);
    if (installed === undefined) {
      return false;
    }

    const result = PackageManifestSchema.safeParse(installed.manifest);
    return result.success && result.data.codeassembly?.content !== undefined;
  } catch {
    return false;
  }
}

// endregion | Helpers
