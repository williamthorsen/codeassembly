import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { chainError } from '@williamthorsen/toolbelt.errors/candidate';

import { findContentPath } from './package-sources.ts';
import { isMissingFile } from './type-guards.ts';

/**
 * Resolves the content root on which a producer command acts: the `--content` value when given, otherwise the
 * `codeassembly.content` key already declared by the producer's own `package.json`. When neither yields one, the error
 * names both routes, since a producer that has not adopted the key is as likely to be here as one that mistyped the
 * flag. `purpose` completes the error's opening phrase, as in "No content root to validate".
 */
export async function resolveContentRoot(content: string | undefined, cwd: string, purpose: string): Promise<string> {
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
      `No content root to ${purpose}: ${manifestPath} doesn't exist. Pass --content <dir>, or run from a package that declares "codeassembly": { "content": "<dir>" }.`,
      { cause: error },
    );
  }

  const declared = findContentPath(manifestPath, parseManifest(manifestPath, raw));
  if (declared === undefined) {
    throw new Error(
      `No content root to ${purpose}: ${manifestPath} doesn't declare a "codeassembly": { "content": "<dir>" } key. Pass --content <dir>, or add the key.`,
    );
  }
  return path.resolve(cwd, declared);
}

// region | Helpers

/** Parses a `package.json`, naming the file so that a syntax error points at what to fix. */
function parseManifest(manifestPath: string, raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (error: unknown) {
    throw chainError(`Cannot read ${manifestPath}`, error);
  }
}

// endregion | Helpers
