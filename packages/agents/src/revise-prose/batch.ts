/**
 * Batch planning: partitioning the scanned file set into units one agent context can hold.
 *
 * A batch is whole files rather than prose spans, because a subagent reads a file whole. It covers the scanned set
 * rather than the candidate-bearing subset, because a unit may carry no detector at all and its violations sit in
 * files no detector nominates.
 */
import type { Batch, Candidate, ScannedFile } from './types.ts';

/**
 * Default ceiling on a batch's combined file bytes. Roughly 24k tokens of file content, which leaves a subagent room
 * for the rule set it holds and the report it composes.
 */
export const DEFAULT_BATCH_BUDGET = 96 * 1_024;

/**
 * Partitions `files` into batches under `budget`, deterministically and in the order the sweep resolved them.
 *
 * The recurring batches lead. Files linked by a shared sentence form a component, which no batch boundary crosses, so
 * every copy of one sentence is adjudicated together and no file reaches two writers. Components pack under the budget
 * like any other batch; a single component that outgrows it becomes one oversized batch, splitting it being what the
 * grouping exists to prevent.
 *
 * The rest pack whole directories, so a batch boundary falls on a directory boundary except where one directory alone
 * exceeds the budget.
 *
 * Throws where `budget` is not a positive integer, a batch of no bytes being unsatisfiable rather than empty.
 */
export function planBatches(input: {
  files: readonly ScannedFile[];
  candidates: readonly Candidate[];
  budget?: number;
}): Batch[] {
  const budget = input.budget ?? DEFAULT_BATCH_BUDGET;
  if (!Number.isSafeInteger(budget) || budget <= 0) {
    throw new Error(`batch budget must be a positive integer, got ${budget}`);
  }

  const filesByPath = new Map(input.files.map((file) => [file.file, file]));
  const components = findRecurringComponents(input.candidates, filesByPath);
  const recurring = new Set(components.flatMap((component) => component.map((file) => file.file)));
  const batches: Batch[] = [];

  for (const run of packGroups(components, budget)) {
    batches.push(composeBatch(batches.length, run, true));
  }

  // A directory carries no indivisibility of its own, so one that outgrows the budget is split before packing; only a
  // component resists that, which is why the two go through different preparation.
  const ordinary = input.files.filter((file) => !recurring.has(file.file));
  const directories = packGroups(splitOversized(groupByDirectory(ordinary), budget), budget);
  for (const run of directories) {
    batches.push(composeBatch(batches.length, run, false));
  }

  return batches;
}

// region | Helpers

/** Builds one batch from the files it covers, summing their bytes. */
function composeBatch(index: number, files: readonly ScannedFile[], recurring: boolean): Batch {
  return {
    index,
    files: files.map((file) => file.file),
    bytes: files.reduce((total, file) => total + file.bytes, 0),
    recurring,
  };
}

/** Returns the directory part of a repository-relative path, or `.` for a file at the root. */
function directoryOf(file: string): string {
  const cut = file.lastIndexOf('/');
  return cut === -1 ? '.' : file.slice(0, cut);
}

/**
 * Groups the files linked by a shared recurring sentence into components, in the order the sweep resolved them.
 *
 * A sentence is the link because it is what an adjudicator rewrites, and two copies reached independently is how one
 * sentence acquires two repairs. The link is transitive: where one file shares a sentence with a second and another
 * with a third, all three form one component, since separating them would hand one file to two writers.
 */
function findRecurringComponents(
  candidates: readonly Candidate[],
  filesByPath: ReadonlyMap<string, ScannedFile>,
): ScannedFile[][] {
  const filesBySentence = new Map<string, Set<string>>();
  for (const candidate of candidates) {
    const files = filesBySentence.get(candidate.sentence) ?? new Set<string>();
    files.add(candidate.file);
    filesBySentence.set(candidate.sentence, files);
  }

  const recurring = filesBySentence
    .values()
    .filter((files) => files.size >= 2)
    .toArray();
  const parent = new Map<string, string>();
  for (const files of recurring) {
    for (const file of files) parent.set(file, file);
  }

  function find(file: string): string {
    let node = file;
    while (parent.get(node) !== node) node = parent.get(node) ?? node;
    return node;
  }

  for (const files of recurring) {
    const linked = [...files];
    const first = linked[0];
    if (first === undefined) continue;
    for (const file of linked.slice(1)) parent.set(find(first), find(file));
  }

  // Keyed by root and filled in sweep order, so both the components and the files within each are deterministic.
  const components = new Map<string, ScannedFile[]>();
  for (const [path, file] of filesByPath) {
    if (!parent.has(path)) continue;
    const root = find(path);
    components.set(root, [...(components.get(root) ?? []), file]);
  }

  return components.values().toArray();
}

/** Splits the file list into consecutive runs sharing a directory, preserving the order the sweep resolved them in. */
function groupByDirectory(files: readonly ScannedFile[]): ScannedFile[][] {
  const groups: ScannedFile[][] = [];
  let directory: string | undefined;

  for (const file of files) {
    const own = directoryOf(file.file);
    if (own !== directory) {
      groups.push([]);
      directory = own;
    }
    groups.at(-1)?.push(file);
  }

  return groups;
}

/**
 * Packs groups into batches under `budget`, never splitting a group that fits. A group exceeding the budget on its own
 * becomes a batch of its own rather than an error: the group is the unit, and nothing smaller is one.
 */
function packGroups(groups: readonly ScannedFile[][], budget: number): ScannedFile[][] {
  const runs: ScannedFile[][] = [];
  let current: ScannedFile[] = [];
  let currentBytes = 0;

  function close(): void {
    if (current.length > 0) runs.push(current);
    current = [];
    currentBytes = 0;
  }

  for (const group of groups) {
    if (group.length === 0) continue;
    const groupBytes = group.reduce((total, file) => total + file.bytes, 0);

    if (groupBytes > budget) {
      close();
      runs.push([...group]);
      continue;
    }

    if (currentBytes + groupBytes > budget) close();
    current.push(...group);
    currentBytes += groupBytes;
  }

  close();
  return runs;
}

/**
 * Chunks any group exceeding `budget` into consecutive runs that fit, leaving the rest as they are. A single file over
 * the budget still stands alone, nothing smaller than a file being a unit.
 */
function splitOversized(groups: readonly ScannedFile[][], budget: number): ScannedFile[][] {
  const prepared: ScannedFile[][] = [];

  for (const group of groups) {
    if (group.reduce((total, file) => total + file.bytes, 0) <= budget) {
      prepared.push([...group]);
      continue;
    }

    let chunk: ScannedFile[] = [];
    let chunkBytes = 0;
    for (const file of group) {
      if (chunk.length > 0 && chunkBytes + file.bytes > budget) {
        prepared.push(chunk);
        chunk = [];
        chunkBytes = 0;
      }
      chunk.push(file);
      chunkBytes += file.bytes;
    }
    if (chunk.length > 0) prepared.push(chunk);
  }

  return prepared;
}

// endregion | Helpers
