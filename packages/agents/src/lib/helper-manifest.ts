import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { chainError } from '@williamthorsen/toolbelt.errors/candidate';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

import { CONTENT_MANIFEST_FILENAME } from './content-root-manifest.ts';
import { isMissingFile } from './type-guards.ts';

/**
 * The `helpers:` key alone. It is parsed apart from the deploy-path schema in `content-root-manifest.ts`, so a
 * malformed list fails only the command that builds helpers and never refuses a root at `sync`.
 */
const HelperManifestSchema = z
  .object({
    helpers: z.array(z.strictObject({ entry: z.string().min(1), out: z.string().min(1) })).optional(),
  })
  .loose();

/** One helper that a content root builds. */
export interface HelperTarget {
  /** The entry module as the manifest writes it, relative to the manifest's directory. */
  readonly entry: string;
  /** The entry module's absolute path. */
  readonly entryPath: string;
  /** The bundle's path relative to the content root, with `/` separators. */
  readonly out: string;
}

/**
 * Reads the helpers declared by the manifest of the content root at `contentRoot`, resolving an absent manifest or an
 * absent key to none. Each `out` must name a distinct `.mjs` inside the content root, because the drift check finds an
 * orphaned bundle by that extension under that root.
 */
export async function readHelperTargets(contentRoot: string): Promise<HelperTarget[]> {
  const manifestPath = path.join(contentRoot, CONTENT_MANIFEST_FILENAME);
  const raw = await readFileIfPresent(manifestPath);
  if (raw === undefined) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (error: unknown) {
    throw chainError(`Invalid ${manifestPath}: malformed YAML`, error);
  }

  const result = HelperManifestSchema.safeParse(parsed ?? {});
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid ${manifestPath}: ${detail}`);
  }

  const targets: HelperTarget[] = [];
  const seen = new Set<string>();
  const helpers = result.data.helpers ?? [];
  for (const [index, helper] of helpers.entries()) {
    const relativeOut = path.relative(contentRoot, path.resolve(contentRoot, helper.out));
    const where = `Invalid ${manifestPath}: helpers.${index}.out`;
    if (relativeOut === '' || relativeOut.startsWith('..') || path.isAbsolute(relativeOut)) {
      throw new Error(`${where}: "${helper.out}" must be inside the content root`);
    }
    if (!relativeOut.endsWith('.mjs')) {
      throw new Error(`${where}: "${helper.out}" must end in .mjs`);
    }
    const out = relativeOut.split(path.sep).join('/');
    if (seen.has(out)) {
      throw new Error(`${where}: "${helper.out}" is already the output of an earlier helper`);
    }
    seen.add(out);
    targets.push({ entry: helper.entry, entryPath: path.resolve(contentRoot, helper.entry), out });
  }
  return targets;
}

// region | Helpers

/** Reads `filePath`, resolving to `undefined` when it is absent and rethrowing any other failure. */
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
