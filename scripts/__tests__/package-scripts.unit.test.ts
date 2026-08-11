import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/** Absolute path to the workspace directory holding every package. */
const packagesDir = path.resolve(import.meta.dirname, '..', '..', 'packages');

/**
 * Script names npm and pnpm invoke on their own schedule, which nmr never resolves as a command. A name nmr does
 * carry — `test` among them — stays out of this set, so an nmr call added there is still reported.
 */
const lifecycleScriptNames: ReadonlySet<string> = new Set([
  'postinstall',
  'postpack',
  'preinstall',
  'prepack',
  'prepare',
  'prepublish',
  'prepublishOnly',
]);

/**
 * Matches a command that reaches `nmr` in command position, directly or behind `pnpm exec`. The lookahead spares the
 * leaf bins (`nmr-compile`, `nmr-fmt`), which start no nested run.
 */
const shelledNmrPattern = /(?:^|&&|\|\||\||;)\s*(?:pnpm\s+exec\s+)?nmr(?![\w-])/;

/** One workspace package, reduced to the manifest scripts this suite inspects. */
interface WorkspaceManifest {
  readonly name: string;
  readonly scripts: Readonly<Record<string, string>>;
}

describe.each(findWorkspaceManifests())('$name scripts', ({ name, scripts }) => {
  it('reach nmr through no shell', () => {
    // A shelled step puts the nested run's output on the channels a tool's takes, so a quiet failure surrenders the
    // whole subtree instead of the failing step.
    expect(
      findShelledNmrScripts(scripts),
      `${name} invokes nmr through a shell. Delete the override where it restates nmr's own default, or move the steps into a hook such as \`build:post\`.`,
    ).toEqual([]);
  });
});

// region | Helpers

/** Lists the script names whose values reach nmr through a shell, passing over the npm lifecycle hooks. */
function findShelledNmrScripts(scripts: Readonly<Record<string, string>>): ReadonlyArray<string> {
  return Object.entries(scripts)
    .filter(([name, value]) => !lifecycleScriptNames.has(name) && shelledNmrPattern.test(value))
    .map(([name]) => name)
    .toSorted();
}

/**
 * Lists every workspace package's manifest, discovered from the directory so that a package added later is covered
 * without editing this suite.
 */
function findWorkspaceManifests(): ReadonlyArray<WorkspaceManifest> {
  return readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      name: entry.name,
      scripts: readScripts(path.join(packagesDir, entry.name, 'package.json')),
    }))
    .toSorted((a, b) => a.name.localeCompare(b.name));
}

/** Reads a manifest's `scripts` field, keeping the string values nmr can resolve as a command. */
function readScripts(manifestPath: string): Readonly<Record<string, string>> {
  const manifest: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (typeof manifest !== 'object' || manifest === null || !('scripts' in manifest)) {
    return {};
  }
  const { scripts } = manifest;
  if (typeof scripts !== 'object' || scripts === null) {
    return {};
  }
  // The annotation is what keeps `Object.entries` from widening each value to `any` and defeating the check below.
  const entries: ReadonlyArray<readonly [string, unknown]> = Object.entries(scripts);
  const result: Record<string, string> = {};
  for (const [name, value] of entries) {
    if (typeof value === 'string') {
      result[name] = value;
    }
  }
  return result;
}

// endregion | Helpers
