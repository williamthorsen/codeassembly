/**
 * Pure drift-detection helpers for the label-map readyup checks.
 *
 * The kit's check closures read the filesystem and delegate the comparison
 * logic here, so it stays unit-testable without touching disk. The check is an
 * independent verifier of the committed map: it re-derives the expected scope
 * set rather than consuming the generator's derivation, which would blind it to
 * a bug in that derivation and couple the root-level kit to the agents package.
 */

import { compareVersions } from 'readyup/check-utils';

const ROOT_SCOPE_KEY = 'root';
const RELEASE_KIT_VERSION_PATTERN = /release-kit-v(\d+\.\d+\.\d+)/;

/** Missing and extra scope keys between an expected set and an actual set. */
export interface ScopeDrift {
  readonly missing: string[];
  readonly extra: string[];
}

/**
 * Derives the scope keys the label map should contain from the package
 * directory names, appending the synthetic `root` scope that
 * `generate label-map` emits whenever at least one package exists.
 */
export function deriveExpectedScopeKeys(packageDirNames: ReadonlyArray<string>): string[] {
  if (packageDirNames.length === 0) {
    return [];
  }
  return [...packageDirNames, ROOT_SCOPE_KEY].toSorted();
}

/** Renders the drift detail naming the missing and extra scope(s). */
export function describeScopeDrift(drift: ScopeDrift): string {
  const parts: string[] = [];
  if (drift.missing.length > 0) {
    parts.push(`missing: ${drift.missing.join(', ')}`);
  }
  if (drift.extra.length > 0) {
    parts.push(`extra: ${drift.extra.join(', ')}`);
  }
  return parts.join('; ');
}

/** Reports which expected scope keys are missing from, or extra in, the actual set. */
export function diffScopeKeys(expected: ReadonlyArray<string>, actual: ReadonlyArray<string>): ScopeDrift {
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  return {
    missing: expected.filter((key) => !actualSet.has(key)),
    extra: actual.filter((key) => !expectedSet.has(key)),
  };
}

/** Reports whether the pinned release-kit version is older than the installed one. */
export function isSchemaVersionBehind(pinnedVersion: string, installedVersion: string): boolean {
  return compareVersions(pinnedVersion, installedVersion) < 0;
}

/** Extracts the release-kit version pinned in a label-map `$schema` URL, or undefined when absent. */
export function parseReleaseKitVersion(schemaUrl: string): string | undefined {
  return RELEASE_KIT_VERSION_PATTERN.exec(schemaUrl)?.[1];
}
