import { readFileSync } from 'node:fs';
import path from 'node:path';

import { findMonorepoRoot, getWorkspacePackageDirs } from '@williamthorsen/nmr/workspace';
import { describe, expect, it } from 'vitest';

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
 * Script names the root manifest may reach nmr from. nmr resolves that manifest as a tier-3 override the way it
 * resolves a package's, so the rest of it is guarded too. `bootstrap` builds and deploys from a fresh checkout,
 * where the bare `nmr` binary is not yet on the path, and so reaches nmr through pnpm by design.
 */
const rootExemptScriptNames: ReadonlySet<string> = new Set([...lifecycleScriptNames, 'bootstrap']);

/**
 * Matches a command reaching `nmr` as a whole token, which covers any runner that fronts it — `npx nmr`,
 * `pnpm exec nmr`, `pnpm --filter x exec nmr`. nmr's own warning inspects only a command's first token, so it
 * backstops none of those forms. The lookahead spares the leaf bins (`nmr-compile`, `nmr-fmt`) and a path segment
 * such as `nmr/bin`, none of which start a nested run.
 */
const shelledNmrPattern = /(?:^|[\s;&|])nmr(?![\w\-/])/;

/** One manifest the guard reads, with the script names it may reach nmr from. */
interface GuardedManifest {
  readonly exemptNames: ReadonlySet<string>;
  readonly manifestPath: string;
  readonly scripts: Readonly<Record<string, string>>;
}

describe.each(findGuardedManifests())('$manifestPath scripts', ({ exemptNames, manifestPath, scripts }) => {
  it('reach nmr through no shell', () => {
    // A shelled step puts the nested run's output on the channels a tool's takes, so a quiet failure surrenders the
    // whole subtree instead of the failing step.
    expect(
      findShelledNmrScripts(scripts, exemptNames),
      `${manifestPath} invokes nmr through a shell. Delete the override where it restates nmr's own default, or move the steps into a hook such as \`build:post\`.`,
    ).toEqual([]);
  });
});

describe('findShelledNmrScripts', () => {
  it.each([
    ['a bare invocation', 'nmr compile'],
    ['a chained invocation', 'tsx scripts/build.ts && nmr compile'],
    ['an unspaced operator', 'tsx scripts/build.ts&&nmr compile'],
    ['a pnpm exec runner', 'pnpm exec nmr build'],
    ['a filtered pnpm runner', 'pnpm --filter codeassembly exec nmr build'],
    ['a recursive pnpm runner', 'pnpm --recursive exec nmr build'],
    ['an npx runner', 'npx nmr build'],
  ])('reports %s', (_label, command) => {
    expect(findShelledNmrScripts({ build: command }, lifecycleScriptNames)).toEqual(['build']);
  });

  it.each([
    ['a leaf bin', 'nmr-compile'],
    ['a flagged leaf bin', 'nmr-fmt --check'],
    ['a path segment', 'node node_modules/@williamthorsen/nmr/bin/cli.js'],
    ['an unrelated command', 'tsx scripts/build.ts && rdy compile'],
  ])('passes over %s', (_label, command) => {
    expect(findShelledNmrScripts({ build: command }, lifecycleScriptNames)).toEqual([]);
  });

  it('passes over an exempt script name', () => {
    expect(findShelledNmrScripts({ prepublishOnly: 'nmr build' }, lifecycleScriptNames)).toEqual([]);
  });

  it('reports every offending name in sorted order', () => {
    const scripts = { build: 'nmr compile', check: 'npx nmr lint', fmt: 'nmr-fmt --write' };
    expect(findShelledNmrScripts(scripts, lifecycleScriptNames)).toEqual(['build', 'check']);
  });
});

// region | Helpers

/** Lists the manifests the guard reads: the monorepo root's, then every workspace package's. */
function findGuardedManifests(): ReadonlyArray<GuardedManifest> {
  const monorepoRoot = findMonorepoRoot(import.meta.dirname);
  const packageManifests = getWorkspacePackageDirs(monorepoRoot).map((dir) => ({
    exemptNames: lifecycleScriptNames,
    manifestPath: path.relative(monorepoRoot, path.join(dir, 'package.json')),
    scripts: readScripts(path.join(dir, 'package.json')),
  }));
  return [
    {
      exemptNames: rootExemptScriptNames,
      manifestPath: 'package.json',
      scripts: readScripts(path.join(monorepoRoot, 'package.json')),
    },
    ...packageManifests,
  ];
}

/** Lists the script names whose values reach nmr through a shell, passing over the exempt names. */
function findShelledNmrScripts(
  scripts: Readonly<Record<string, string>>,
  exemptNames: ReadonlySet<string>,
): ReadonlyArray<string> {
  return Object.entries(scripts)
    .filter(([name, value]) => !exemptNames.has(name) && shelledNmrPattern.test(value))
    .map(([name]) => name)
    .toSorted();
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
