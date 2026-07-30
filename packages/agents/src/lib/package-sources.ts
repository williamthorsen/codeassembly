import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

import { z } from 'zod';

import { isMissingFile } from './type-guards.ts';

/**
 * The only part of a dependency's `package.json` that CodeAssembly reads: the content directory it declares. Both
 * levels are `.loose()` so every other field passes through and a later cut can add per-package config without a
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

/** A declared package resolved to the content directory it ships, named by the package it came from. */
export interface PackageSource {
  readonly name: string;
  readonly dir: string;
}

/**
 * Resolves each declared package name to the content directory it ships, in declaration order, for use as a content
 * source. Resolution walks the `node_modules` chain Node itself would search from `baseDir`, so it holds under pnpm's
 * symlinked layout and under `workspace:*` links — which is what lets a producing repo consume its own guidance
 * through the same declaration a third party writes. Throws when a declared package is not installed or declares no
 * content directory; whether that directory exists is left to the caller's source validation, so a package source and
 * a hand-declared one fail through one path.
 */
export async function resolvePackageSources(
  names: ReadonlyArray<string>,
  baseDir: string,
): Promise<ReadonlyArray<PackageSource>> {
  const resolved: Array<PackageSource> = [];
  for (const name of names) {
    const installed = await findInstalledPackage(name, baseDir);
    if (installed === undefined) {
      throw new Error(
        `Declared package "${name}" is not installed. Searched: ${listCandidateDirs(name, baseDir).join(', ')}.`,
      );
    }
    resolved.push({ name, dir: path.join(installed.dir, readContentPath(name, installed.manifest)) });
  }
  return resolved;
}

// region | Helpers

/**
 * Locates the installed directory of `name`, with its parsed `package.json`, by probing each candidate directory
 * Node's resolver would search. Probing the filesystem rather than resolving a package subpath is deliberate: a
 * modern `exports` map does not expose `./package.json`, so `require.resolve` cannot reach it, and a guidance-only
 * package has no importable entry to resolve instead.
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
  // `resolve.paths` returns null for a specifier Node would never look up in `node_modules` (a core module, a
  // relative path), which a garbage declaration can produce — an empty candidate list reports it as not installed.
  return (requireFromBase.resolve.paths(name) ?? []).map((nodeModules) => path.join(nodeModules, name));
}

/** Parses a package's `package.json` text, naming the package so a syntax error is attributable. */
function parsePackageManifest(name: string, raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Package "${name}" has an unreadable package.json: ${message}`, { cause: error });
  }
}

/**
 * Reads the content directory a package declares under `codeassembly.content`. The key is required and has no default:
 * a default location would claim a directory name in every producer's package root, so a producer states where its
 * content lives and can nest it under a directory it already owns. Throws when the key is malformed or absent, naming
 * the package either way.
 */
function readContentPath(name: string, manifest: unknown): string {
  const result = PackageManifestSchema.safeParse(manifest);
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Package "${name}" declares an invalid "codeassembly" key: ${detail}.`);
  }

  const content = result.data.codeassembly?.content;
  if (content === undefined) {
    throw new Error(
      `Package "${name}" declares no CodeAssembly content. A package that ships content sets "codeassembly": { "content": "<dir>" } in its package.json, and includes that directory in its published "files".`,
    );
  }
  return content;
}

/**
 * Reads `filePath`, resolving to `undefined` when it is absent. Any other failure — e.g. `EACCES` on an unreadable
 * `node_modules` directory — rethrows, so a permission problem surfaces instead of reading as a bare absence and
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

// endregion | Helpers
