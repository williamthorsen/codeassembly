import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describeError } from '@williamthorsen/toolbelt.errors';
import { parse } from 'yaml';

import { CONFIG_FILE } from '../layout/index.ts';
import { isEnoent } from '../type-guards.ts';
import type { KbRoot } from '../types.ts';
import { configFileShape, defaultKbConfig, type KbConfig } from './config-schema.ts';
import { KbLoaderError } from './kb-loader-error.ts';

/**
 * Loads the effective check configuration for a KB root. Returns {@link defaultKbConfig} verbatim when no
 * `.kb/config.yaml` exists; a file present but omitting `targets` or `exclude` inherits that field's default.
 *
 * Mirrors {@link loadAliases}: a single plain-object input, structural defects (malformed YAML, wrong types) throw a
 * {@link KbLoaderError} naming the file. I/O errors other than a missing file propagate.
 */
export async function loadKbConfig(input: { kbRoot: KbRoot }): Promise<KbConfig> {
  const path = join(input.kbRoot.path, CONFIG_FILE);

  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if (isEnoent(error)) {
      return defaultKbConfig;
    }
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = parse(text);
  } catch (error) {
    throw new KbLoaderError(`${path}: malformed YAML: ${describeError(error)}`, { cause: error });
  }

  const result = configFileShape.safeParse(parsed ?? {});
  if (!result.success) {
    throw new KbLoaderError(`${path}: invalid config.yaml — ${result.error.issues[0]?.message ?? 'unknown error'}`);
  }

  return {
    targets: result.data.targets ?? defaultKbConfig.targets,
    exclude: result.data.exclude ?? defaultKbConfig.exclude,
  };
}
