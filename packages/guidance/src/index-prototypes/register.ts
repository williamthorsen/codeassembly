import path from 'node:path';

import { fail } from './failure.ts';
import { intakeScreenshot } from './intake-screenshot.ts';
import { isValidSlug, nextVersion, readManifest, resolveNumber, writeManifest } from './manifest.ts';
import { parseInputs, requireFlag } from './parse-args.ts';
import type { IndexPrototypesFailure, IndexPrototypesResult, Manifest, ManifestEntry, Note } from './types.ts';

/** Returns true when `value` parses as an http or https URL. */
export function isWebUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

/** Adds a registration to the set's manifest, creating the manifest on the set's first registration. */
export async function register(
  setDir: string,
  values: Record<string, string>,
  notes: Note[],
  now: Date,
): Promise<IndexPrototypesResult> {
  const slug = requireFlag(values, 'slug');
  if (!isValidSlug(slug)) {
    return fail('invalid-slug', `slug "${slug}" must match [a-z0-9][a-z0-9-]{0,39}`);
  }
  const url = requireFlag(values, 'url');
  if (!isWebUrl(url)) {
    return fail('invalid-url', `--url "${url}" is not an http or https URL`);
  }

  const read = await readManifest(setDir);
  if (read.kind === 'invalid') {
    return fail('invalid-manifest', read.message);
  }
  const existing = read.kind === 'ok' ? read.manifest : null;
  const setTitle = values['set-title'] ?? existing?.title;
  if (setTitle === undefined) {
    return fail('missing-set-title', 'the first registration in a set requires --set-title');
  }

  const number = resolveRegistrationNumber(existing, slug, values['number']);
  if (typeof number !== 'number') {
    return number;
  }

  const version = nextVersion(existing, slug);
  let shot: string | null = null;
  const screenshot = values['screenshot'];
  if (screenshot !== undefined) {
    const intake = await intakeScreenshot({
      sourcePath: path.resolve(screenshot),
      setDir,
      slug,
      version,
    });
    if (!intake.ok) {
      return fail(intake.error, intake.message);
    }
    shot = intake.shot;
  }

  const entry: ManifestEntry = {
    slug,
    number,
    version,
    registeredAt: now.toISOString(),
    title: requireFlag(values, 'title'),
    url,
    source: values['source'] ?? null,
    lens: values['lens'] ?? null,
    inputs: parseInputs(values['inputs']),
    description: values['description'] ?? null,
    notes,
    shot,
  };

  const manifest: Manifest = {
    title: setTitle,
    indexUrl: existing?.indexUrl ?? null,
    summary: existing?.summary ?? null,
    entries: [...(existing?.entries ?? []), entry],
  };
  const manifestPath = await writeManifest(setDir, manifest);
  return { ok: true, command: 'register', manifestPath, entry };
}

// region | Helpers

/**
 * Returns the number that a registration of `slug` takes: the one that the set assigns when `requested` is absent,
 * or the requested one once it is checked. A registered slug keeps its number, a new slug cannot take a number that
 * another slug already has, and the value must be a positive integer; for a request that fails one of those, returns
 * the failure.
 */
function resolveRegistrationNumber(
  manifest: Manifest | null,
  slug: string,
  requested: string | undefined,
): number | IndexPrototypesFailure {
  const assigned = resolveNumber(manifest, slug);
  if (requested === undefined) {
    return assigned;
  }
  const number = Number(requested);
  if (!Number.isSafeInteger(number) || number < 1) {
    return fail('number-conflict', `--number "${requested}" must be a positive integer`);
  }
  const entries = manifest?.entries ?? [];
  if (entries.some((entry) => entry.slug === slug)) {
    return assigned === number
      ? number
      : fail('number-conflict', `slug "${slug}" is number ${assigned}, not ${number}`);
  }
  const holder = entries.find((entry) => entry.number === number);
  return holder === undefined ? number : fail('number-conflict', `number ${number} belongs to slug "${holder.slug}"`);
}

// endregion | Helpers
