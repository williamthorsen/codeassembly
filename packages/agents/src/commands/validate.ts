import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { chainError } from '@williamthorsen/toolbelt.errors/candidate';

import { formatContentDefects } from '../lib/content-defects.ts';
import { validateContentRoot } from '../lib/content-validation.ts';
import { ALL_HARNESS_IDS } from '../lib/harness.ts';
import { findContentPath } from '../lib/package-sources.ts';
import { isMissingFile } from '../lib/type-guards.ts';
import type { HarnessId } from '../lib/types.ts';

/** What `validate` was asked to check: an explicit content root, and which harnesses to check it against. */
export interface ValidateOptions {
  readonly content?: string | undefined;
  readonly harness: HarnessId | 'all';
}

/**
 * Validates a content root and reports what it found, answering whether the root is clean. Returns a boolean rather
 * than throwing so the caller can exit non-zero on a multi-line report without the CLI's top-level handler prefixing
 * it with `Error:` — the report is a list of findings, not one failure.
 *
 * `cwd` is injectable so a test can point the `package.json` route at a fixture rather than the process's own directory.
 */
export async function validateCommand(options: ValidateOptions, cwd: string = process.cwd()): Promise<boolean> {
  const root = await resolveContentRoot(options.content, cwd);
  const harnessIds = options.harness === 'all' ? ALL_HARNESS_IDS : [options.harness];

  console.info(`Validating ${root} against ${harnessIds.join(', ')}`);
  const defects = await validateContentRoot(root, harnessIds);

  if (defects.length === 0) {
    console.info('✅ No defects found.');
    return true;
  }

  console.error(`\n❌ ${defects.length} defect(s) found:\n`);
  console.error(formatContentDefects(defects));
  return false;
}

// region | Helpers

/**
 * Resolves the content root to validate: the `--content` value when given, otherwise the `codeassembly.content` key
 * the producer's own `package.json` already declares. Neither yielding one names both routes, since a producer that
 * has not adopted the key is as likely to be here as one that mistyped the flag.
 */
async function resolveContentRoot(content: string | undefined, cwd: string): Promise<string> {
  if (content !== undefined) {
    return path.resolve(cwd, content);
  }

  const manifestPath = path.join(cwd, 'package.json');
  let raw: string;
  try {
    raw = await readFile(manifestPath, 'utf8');
  } catch (error: unknown) {
    if (!isMissingFile(error)) {
      throw error;
    }
    throw new Error(
      `No content root to validate: there is no package.json at ${manifestPath}. Pass --content <dir>, or run from a package that declares "codeassembly": { "content": "<dir>" }.`,
      { cause: error },
    );
  }

  const declared = findContentPath(manifestPath, parseManifest(manifestPath, raw));
  if (declared === undefined) {
    throw new Error(
      `No content root to validate: ${manifestPath} declares no "codeassembly": { "content": "<dir>" } key. Pass --content <dir>, or add the key.`,
    );
  }
  return path.resolve(cwd, declared);
}

/** Parses a `package.json`, naming the file so a syntax error points at what to fix. */
function parseManifest(manifestPath: string, raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (error: unknown) {
    throw chainError(`Cannot read ${manifestPath}`, error);
  }
}

// endregion | Helpers
