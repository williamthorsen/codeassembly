import { chmod, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

import type { ContentRootRef } from '../lib/content-root-manifest.ts';
import { describeContentRoot } from '../lib/declared-sources.ts';
import { emitReport, printLine } from '../lib/emit-report.ts';
import { copyItem, linkItem } from '../lib/installer.ts';
import { computeContentHash, detectDrift } from '../lib/manifest.ts';
import type { ReportLine } from '../lib/report-line.ts';
import { isEnoent } from '../lib/type-guards.ts';
import type { HarnessConfig, InstallOptions, ManifestEntry } from '../lib/types.ts';

/**
 * The extensions of the files that `install` deploys from `content/scripts/` to a harness home: `.sh` shell helpers
 * and `.mjs` TypeScript bundles, either kind invoked by a skill, a subagent, or the harness itself. Anything else
 * there (the README) documents the directory and is not deployed from it.
 */
const SCRIPT_EXTENSIONS: ReadonlyArray<string> = ['.mjs', '.sh'];

/**
 * Installs script files from every content root's `scripts/` directory into the target scripts directory.
 * Scripts are flat files without frontmatter or harness-specific variants, so this function merges the roots' scripts
 * by file name rather than letting one root own the directory.
 * Copied scripts receive the executable bit (0o755); symlinked scripts inherit the source's permissions.
 */
export async function installScripts(
  roots: ReadonlyArray<ContentRootRef>,
  scriptsDestDir: string,
  harnessHome: string,
  harnessConfig: HarnessConfig,
  existingByPath: ReadonlyMap<string, ManifestEntry>,
  options: InstallOptions,
): Promise<ReadonlyArray<ManifestEntry>> {
  const { claims, foundDirectory, warnings } = await collectScriptClaims(roots);
  emitReport(warnings);
  if (!foundDirectory) {
    printLine({
      glyph: 'warning',
      indent: 2,
      level: 'warn',
      text: "The content roots don't contain a scripts directory, skipping script installation",
    });
    return [];
  }

  const entries: Array<ManifestEntry> = [];

  for (const [entry, srcPath] of claims) {
    const destPath = path.join(scriptsDestDir, entry);
    const relativePath = `${harnessConfig.scriptsDirName}/${entry}`;

    if (options.dryRun) {
      const action = options.link ? 'link' : 'copy';
      console.info(`    [${action}] ${relativePath}`);
      entries.push({ relativePath, contentHash: 'dry-run', linked: options.link });
      continue;
    }

    const existingEntry = existingByPath.get(relativePath);
    if (existingEntry && !options.force) {
      const drift = await detectDrift(existingEntry, harnessHome);
      if (drift === 'modified') {
        printLine({ glyph: 'warning', indent: 2, level: 'warn', text: `Skipping modified item: ${relativePath}` });
        entries.push(existingEntry);
        continue;
      }
    }

    await (options.link ? linkItem(srcPath, destPath) : copyItem(srcPath, destPath));

    if (!options.link) {
      await chmod(destPath, 0o755);
    }

    // Compute hash from source for symlinked scripts (dest symlink may not resolve in all environments)
    const hashPath = options.link ? srcPath : destPath;
    entries.push({
      relativePath,
      contentHash: await computeContentHash(hashPath),
      linked: options.link,
    });
  }

  return entries;
}

// region | Helpers

/**
 * Collects the installable scripts across `roots`, keyed by file name, taking each name from the highest-precedence
 * root that provides it. A name also provided by a lower-precedence root is dropped and reported: Scripts are deployed
 * into one flat directory, and their file names are undeclared, so a collision states none of the override intent that
 * a declared artifact's slug does.
 *
 * `foundDirectory` distinguishes a run in which the roots don't contain any `scripts/` directory at all from one in
 * which the directories exist but contain nothing installable, because only the first is worth a warning.
 */
async function collectScriptClaims(roots: ReadonlyArray<ContentRootRef>): Promise<{
  claims: ReadonlyMap<string, string>;
  foundDirectory: boolean;
  warnings: ReadonlyArray<ReportLine>;
}> {
  const claims = new Map<string, string>();
  const claimants = new Map<string, ContentRootRef>();
  const warnings: Array<ReportLine> = [];
  let foundDirectory = false;

  for (const root of roots) {
    const scriptsSrcDir = path.join(root.dir, 'scripts');
    let dirEntries: ReadonlyArray<string>;
    try {
      dirEntries = await readdir(scriptsSrcDir);
    } catch (error: unknown) {
      if (!isEnoent(error)) {
        throw error;
      }
      continue;
    }
    foundDirectory = true;

    for (const entry of dirEntries) {
      if (entry.startsWith('.')) {
        continue;
      }

      if (SCRIPT_EXTENSIONS.every((extension) => !entry.endsWith(extension))) {
        continue;
      }

      const srcPath = path.join(scriptsSrcDir, entry);

      if (!(await stat(srcPath)).isFile()) {
        continue;
      }

      const claimant = claimants.get(entry);
      if (claimant !== undefined) {
        warnings.push({
          glyph: 'warning',
          indent: 2,
          level: 'warn',
          text:
            `Script ${entry} is provided by more than one content root: installing it from ` +
            `${describeContentRoot(claimant)} and ignoring ${describeContentRoot(root)}.`,
        });
        continue;
      }
      claims.set(entry, srcPath);
      claimants.set(entry, root);
    }
  }

  return { claims, foundDirectory, warnings };
}

// endregion | Helpers
