import { join } from 'node:path';

import { enumerateNotePaths } from '@williamthorsen/kb/check';
import { loadKbConfig } from '@williamthorsen/kb/config';
import { resolveKbDir, TAXONOMY_FILE } from '@williamthorsen/kb/layout';
import { loadTaxonomy, resolveDomain } from '@williamthorsen/kb/taxonomy';

/** A store's declared taxonomy set against the folders its notes actually occupy. */
export interface KbSurvey {
  /** Absolute path of `.kb/taxonomy.yaml`, whether or not the file exists. */
  taxonomyPath: string;
  /** Every declared domain, ordered by path. */
  domains: SurveyedDomain[];
  /** Every folder holding notes that no domain declares, ordered by path. */
  undeclaredFolders: SurveyedFolder[];
}

/** A domain the taxonomy declares, with what the store's notes say about it. */
export interface SurveyedDomain {
  /** The domain's assertions-root-relative slash-path. */
  path: string;
  /** The one-line description, empty when the domain was declared without one. */
  description: string;
  /** Whether the domain was declared under `provisional:`, and so has not been reviewed. */
  provisional: boolean;
  /** Notes at the domain or in any folder beneath it. */
  noteCount: number;
}

/** A folder holding notes that no domain declares. */
export interface SurveyedFolder {
  /** The folder's assertions-root-relative slash-path. */
  path: string;
  /** Notes at the folder or in any folder beneath it. */
  noteCount: number;
}

/**
 * Reads a store's shape without opening a note: the domains its taxonomy declares, with each one's description,
 * review state, and note count, and the folders holding notes that no domain declares.
 *
 * The note set comes from the same enumeration `kb check` runs, so the survey sees exactly the notes the store's
 * `targets` and `exclude` admit and cannot disagree with what a later check reports. A folder is undeclared here on
 * the same terms `taxonomy.undeclared` uses: the folder a note sits in directly, matched against the taxonomy exactly,
 * so a folder nested under a declared domain still surfaces. Unlike the drift rules, the survey stays on for a store
 * declaring nothing, where every folder holding notes is undeclared — that is the reading a store adopting a taxonomy
 * needs.
 *
 * `noteCount` carries one meaning throughout: notes at the path or beneath it. A grouping domain holding only
 * subfolders therefore reads as populated rather than empty, matching how the rules decide a domain is in use.
 *
 * A malformed `.kb/config.yaml` or `.kb/taxonomy.yaml` throws a `KbLoaderError` from the loader that read it.
 */
export async function surveyKb(input: { kbPath: string }): Promise<KbSurvey> {
  const kbRoot = { path: input.kbPath, kbDir: resolveKbDir(input.kbPath) };
  const [config, taxonomy] = await Promise.all([loadKbConfig({ kbRoot }), loadTaxonomy({ kbRoot })]);
  const relativePaths = await enumerateNotePaths({ kbRoot: input.kbPath, config });

  // A note at the assertions root resolves to no domain and so counts toward no folder.
  const notesByFolder = new Map<string, number>();
  for (const relativePath of relativePaths) {
    const folder = resolveDomain(relativePath);
    if (folder !== undefined) {
      notesByFolder.set(folder, (notesByFolder.get(folder) ?? 0) + 1);
    }
  }

  const domains = taxonomy
    .entries()
    .map(([path, entry]) => ({
      path,
      description: entry.description,
      provisional: entry.provisional,
      noteCount: countNotesUnder(path, notesByFolder),
    }))
    .toArray()
    .toSorted(compareByPath);

  const undeclaredFolders = notesByFolder
    .keys()
    .filter((path) => !taxonomy.has(path))
    .map((path) => ({ path, noteCount: countNotesUnder(path, notesByFolder) }))
    .toArray()
    .toSorted(compareByPath);

  return { taxonomyPath: join(input.kbPath, TAXONOMY_FILE), domains, undeclaredFolders };
}

// region | Helpers

/** Orders survey entries by their slash-path. */
function compareByPath(a: { path: string }, b: { path: string }): number {
  if (a.path === b.path) {
    return 0;
  }
  return a.path < b.path ? -1 : 1;
}

/** Counts the notes sitting at `path` or in any folder beneath it. */
function countNotesUnder(path: string, notesByFolder: ReadonlyMap<string, number>): number {
  const prefix = `${path}/`;
  let count = 0;
  for (const [folder, notes] of notesByFolder) {
    if (folder === path || folder.startsWith(prefix)) {
      count += notes;
    }
  }
  return count;
}

// endregion | Helpers
