import { readFile } from 'node:fs/promises';

import { isMissingFile, isRecord } from '../lib/type-guards.ts';

/**
 * Resolves the work type a ticket's labels name, by inverting the label map's `types` section and intersecting it with
 * the labels given.
 *
 * Yields nothing where the labels name no type and where they name more than one. Two type labels on one ticket say
 * that nobody has decided which it is, and picking either would record a decision no one made.
 *
 * A label map that is absent or unreadable also yields nothing: a repository that configures no map has no ticket type
 * to compare against, which is a missing signal rather than a failure.
 */
export async function resolveTicketType(input: {
  labelMapPath: string;
  labels: readonly string[];
}): Promise<string | undefined> {
  const types = await readTypeMap(input.labelMapPath);
  if (types === undefined) {
    return undefined;
  }

  const matched = new Set<string>();
  for (const label of input.labels) {
    for (const [key, name] of Object.entries(types)) {
      if (name === label) {
        matched.add(key);
      }
    }
  }

  const [only] = matched;
  return matched.size === 1 ? only : undefined;
}

// region | Helpers

/** Reads the label map's `types` section, or nothing where the file is absent, unparseable, or declares no section. */
async function readTypeMap(path: string): Promise<Record<string, string> | undefined> {
  let content: string;
  try {
    content = await readFile(path, 'utf8');
  } catch (error) {
    if (isMissingFile(error)) {
      return undefined;
    }
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return undefined;
  }
  if (!isRecord(parsed) || !isRecord(parsed.types)) {
    return undefined;
  }

  const types: Record<string, string> = {};
  for (const [key, name] of Object.entries(parsed.types)) {
    if (typeof name === 'string') {
      types[key] = name;
    }
  }
  return types;
}

// endregion | Helpers
