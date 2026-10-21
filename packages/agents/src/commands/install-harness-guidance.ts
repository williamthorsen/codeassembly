import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { extractAmbientRegionContent, hasAmbientRegion, injectAmbientRegion } from '../lib/ambient-region.ts';
import type { ContentRootRef } from '../lib/content-root-manifest.ts';
import { describeContentRoot } from '../lib/declared-sources.ts';
import { emitReport, printLine } from '../lib/emit-report.ts';
import {
  listGuidanceTemplateFiles,
  renderGuidanceTemplateFile,
  resolveGuidanceTemplateDir,
} from '../lib/guidance-template.ts';
import { HARNESSES } from '../lib/harness.ts';
import { copyItem, unlinkIfSymlink } from '../lib/installer.ts';
import { computeContentHash, detectDrift } from '../lib/manifest.ts';
import { isEnoent } from '../lib/type-guards.ts';
import type { HarnessId, InstallOptions, ManifestEntry } from '../lib/types.ts';

/** One content root providing a harness's guidance template, and the file names that it installs from there. */
interface TemplateRoot {
  readonly root: ContentRootRef;
  readonly fileNames: ReadonlyArray<string>;
}

/**
 * Installs harness-specific guidance files from `content/guidance/_harnesses/{harnessId}/` into the harness
 * home directory. Harness guidance is always copied and rewritten (never symlinked), because install-time path
 * rewriting produces absolute link targets that agents can resolve without knowing a path convention.
 */
export async function installHarnessGuidance(
  roots: ReadonlyArray<ContentRootRef>,
  harnessPaths: { harnessHome: string },
  harnessId: HarnessId,
  existingByPath: ReadonlyMap<string, ManifestEntry>,
  options: InstallOptions,
): Promise<ReadonlyArray<ManifestEntry>> {
  const harnessConfig = HARNESSES[harnessId];
  const shippingRoots = await findTemplateRoots(roots, harnessId);
  const owner = shippingRoots.at(0);
  if (owner === undefined) {
    printLine({
      glyph: 'warning',
      indent: 2,
      level: 'warn',
      text: `The content roots don't contain a ${harnessId} guidance directory, skipping harness guidance installation`,
    });
    return [];
  }
  const shadowed = shippingRoots.slice(1);
  if (shadowed.length > 0) {
    emitReport([
      {
        glyph: 'warning',
        indent: 2,
        level: 'warn',
        text:
          `The ${harnessId} guidance template is provided by more than one content root: installing it from ` +
          `${describeContentRoot(owner.root)} and ignoring ${shadowed.map((shipping) => describeContentRoot(shipping.root)).join(', ')}.`,
      },
    ]);
  }

  const guidanceSrcDir = resolveGuidanceTemplateDir(owner.root.dir, harnessId);

  const entries: Array<ManifestEntry> = [];

  for (const entry of owner.fileNames) {
    const srcPath = path.join(guidanceSrcDir, entry);
    const destPath = path.join(harnessPaths.harnessHome, entry);

    // Render before the dry-run gate so that the render reports missing include targets, cycles, out-of-tree
    // references, malformed hooks, and dead in-body locators even when the dry run doesn't write any files.
    const renderedContent = entry.endsWith('.md')
      ? await renderGuidanceTemplateFile(owner.root, harnessId, entry)
      : undefined;

    if (options.dryRun) {
      console.info(`    [copy] ${entry} (guidance)`);
      entries.push({ relativePath: entry, contentHash: 'dry-run', linked: false });
      continue;
    }

    const existingEntry = existingByPath.get(entry);
    if (existingEntry && !options.force) {
      const drift = await detectDrift(existingEntry, harnessPaths.harnessHome);
      if (drift === 'modified') {
        printLine({
          glyph: 'warning',
          indent: 2,
          level: 'warn',
          text: `Skipping modified item: ${harnessConfig.homeDir}/${entry}`,
        });
        entries.push(existingEntry);
        continue;
      }
    }

    // The wholesale re-render below would drop whatever sync wrote into the ambient region, so capture the existing
    // destination's region content first; it is spliced back once the fresh render is in place.
    const preservedAmbient = entry.endsWith('.md') ? await readAmbientRegionContent(destPath) : undefined;

    await unlinkIfSymlink(destPath);
    if (renderedContent === undefined) {
      await copyItem(srcPath, destPath);
    } else {
      // Splice the preserved region content into the fresh render. The region's location comes from the template;
      // its content belongs to sync and must survive an install. A template that no longer contains the region takes
      // precedence: The content is dropped and the next `sync` re-delivers or warns.
      const shouldSplice =
        preservedAmbient !== undefined && preservedAmbient !== '' && hasAmbientRegion(renderedContent);
      await writeFile(
        destPath,
        shouldSplice ? injectAmbientRegion(renderedContent, preservedAmbient) : renderedContent,
        'utf8',
      );
    }

    entries.push({
      relativePath: entry,
      contentHash: await computeContentHash(destPath),
      linked: false,
    });
  }

  return entries;
}

// region | Helpers

/**
 * Reports the roots providing a guidance template for `harnessId`, highest precedence first, each paired with the file
 * names that it installs. A root provides a template when its `guidance/_harnesses/<harnessId>/` directory contains at
 * least one such file; a directory that is absent, or contains only dotfiles and subdirectories, provides nothing, so
 * it cannot shadow the root that would otherwise supply the harness.
 *
 * The file names are returned with the root so that selection and installation apply one definition of an installable
 * entry. Because `copyItem` copies a directory recursively and `computeContentHash` reads a file, an entry that the
 * two passes classified differently would be written to the harness home and then fail the hash that records it.
 *
 * Ownership is whole-directory rather than per file, which keeps the template's `guidance/shared/AGENTS.md`
 * include resolving inside the one root from which the template came.
 */
async function findTemplateRoots(
  roots: ReadonlyArray<ContentRootRef>,
  harnessId: HarnessId,
): Promise<ReadonlyArray<TemplateRoot>> {
  const shipping: Array<TemplateRoot> = [];
  for (const root of roots) {
    const fileNames = await listGuidanceTemplateFiles(root.dir, harnessId);
    if (fileNames.length > 0) {
      shipping.push({ root, fileNames });
    }
  }
  return shipping;
}

/**
 * Reads the ambient-region content of the file at `filePath`, returning `undefined` when the file is absent or
 * doesn't contain a complete region.
 */
async function readAmbientRegionContent(filePath: string): Promise<string | undefined> {
  try {
    return extractAmbientRegionContent(await readFile(filePath, 'utf8'));
  } catch (error: unknown) {
    if (isEnoent(error)) {
      return undefined;
    }
    throw error;
  }
}

// endregion | Helpers
