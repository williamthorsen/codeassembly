import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import { isRecord } from '../test-utils/is-record.ts';
import { listWorkspaceManifests, listWorkspacePackages } from '../test-utils/workspace-packages.ts';

const WORKSPACE_CONFIG_PATH = fileURLToPath(new URL('../../pnpm-workspace.yaml', import.meta.url));

// The manifest fields whose specifier names the version a dependency resolves to. A peer range names the
// compatibility window a package accepts instead, which `catalog:` would collapse to a single version.
const PINNED_FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies'];

interface DependencyPin {
  dependency: string;
  manifest: string;
  specifier: string;
}

describe('dependency pinning', () => {
  const catalog = readCatalogedDependencies();
  const pins = readDependencyPins();

  // Both prohibitions below assert an empty list, which a scan that reached nothing would satisfy too. The
  // expected manifests are derived independently of the scan, so a scan that reached none of them fails here.
  it('reads the catalog and a pin from every manifest', () => {
    expect(catalog).toContain('vitest');
    expect([...new Set(pins.map((pin) => pin.manifest))].toSorted()).toEqual(
      ['root', ...listWorkspacePackages()].toSorted(),
    );
  });

  it('permits no dependency pinned literally in two or more manifests', () => {
    expect(listDuplicateLiteralPins(pins)).toEqual([]);
  });

  it('permits no literal pin of a cataloged dependency', () => {
    expect(listCatalogedLiteralPins(pins, catalog)).toEqual([]);
  });
});

// region | Helpers

/** Reports whether a specifier pins a version itself rather than deferring to the catalog or the workspace. */
function isLiteralPin(specifier: string): boolean {
  return !specifier.startsWith('catalog:') && !specifier.startsWith('workspace:');
}

/** Reports each literal pin of a cataloged dependency, as `{dependency}: {manifest}`. */
function listCatalogedLiteralPins(pins: DependencyPin[], catalog: string[]): string[] {
  return pins
    .filter((pin) => isLiteralPin(pin.specifier) && catalog.includes(pin.dependency))
    .map((pin) => `${pin.dependency}: ${pin.manifest}`)
    .toSorted();
}

/** Reports each dependency pinned literally in two or more manifests, as `{dependency}: {manifests}`. */
function listDuplicateLiteralPins(pins: DependencyPin[]): string[] {
  const manifestsByDependency = new Map<string, string[]>();
  for (const pin of pins) {
    if (!isLiteralPin(pin.specifier)) continue;

    manifestsByDependency.set(pin.dependency, [...(manifestsByDependency.get(pin.dependency) ?? []), pin.manifest]);
  }

  return [...manifestsByDependency]
    .filter(([, manifests]) => manifests.length >= 2)
    .map(([dependency, manifests]) => `${dependency}: ${manifests.join(', ')}`)
    .toSorted();
}

/** Names a manifest's owner: the package directory holding it, or `root` for the repo's own manifest. */
function nameManifest(manifestPath: string): string {
  const ownerDir = path.dirname(manifestPath);

  return path.basename(path.dirname(ownerDir)) === 'packages' ? path.basename(ownerDir) : 'root';
}

/** Names every dependency the workspace catalog pins. */
function readCatalogedDependencies(): string[] {
  const config: unknown = parse(readFileSync(WORKSPACE_CONFIG_PATH, 'utf8'));
  const catalog = isRecord(config) ? config['catalog'] : undefined;

  return isRecord(catalog) ? Object.keys(catalog).toSorted() : [];
}

/** Reads every version-pinning dependency declaration across the root and package manifests. */
function readDependencyPins(): DependencyPin[] {
  return listWorkspaceManifests().flatMap((manifestPath) => {
    const manifest: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (!isRecord(manifest)) return [];

    const manifestName = nameManifest(manifestPath);

    return PINNED_FIELDS.flatMap((field) => {
      const declarations = manifest[field];
      if (!isRecord(declarations)) return [];

      return Object.entries(declarations).flatMap(([dependency, specifier]) =>
        typeof specifier === 'string' ? [{ dependency, manifest: manifestName, specifier }] : [],
      );
    });
  });
}

// endregion | Helpers
