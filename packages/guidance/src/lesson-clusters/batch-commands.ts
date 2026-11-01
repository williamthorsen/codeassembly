/** The commands of batched clustering: `batch`, `lessons`, and `combine`. */
import { readdir } from 'node:fs/promises';
import path from 'node:path';

import { describeError } from '@williamthorsen/toolbelt.errors';

import {
  buildLessonInventory,
  type ClusteredBatch,
  combineMaps,
  DEFAULT_BATCH_SIZE,
  splitInventory,
} from './batches.ts';
import {
  CommandError,
  type CommandResult,
  describeViolations,
  type ParsedFlags,
  readJsonFile,
  readJsonPath,
  readPositiveInteger,
  readRequired,
  writeJson,
} from './command-support.ts';
import { ClusterMapSchema, InventorySchema } from './schemas.ts';
import { validateClusters } from './validate-clusters.ts';

const BATCH_FILE = /^batch-(\d+)\.json$/;

/** Splits the inventory into batch files under `--out`. */
export async function runBatch(flags: ParsedFlags, cwd: string): Promise<CommandResult> {
  const inventory = await readJsonFile(flags, 'inventory', InventorySchema, cwd);
  const dir = path.resolve(cwd, readRequired(flags, 'out'));
  const size = readPositiveInteger(flags, 'batch-size') ?? DEFAULT_BATCH_SIZE;
  const batches = splitInventory(inventory, size);
  const written = [];
  for (const [index, batch] of batches.entries()) {
    const name = String(index + 1).padStart(2, '0');
    const file = path.join(dir, `batch-${name}.json`);
    await writeJson(file, batch);
    written.push({
      name,
      path: file,
      map: path.join(dir, `map-${name}.json`),
      events: batch.pool.length + batch.deferred.length,
    });
  }
  return { ok: true, batches: written };
}

/** Validates the merge map against the lesson inventory and writes the event map that it expands to. */
export async function runCombine(flags: ParsedFlags, cwd: string): Promise<CommandResult> {
  const batches = await readBatches(flags, cwd);
  const lessons = await readJsonFile(flags, 'lessons', InventorySchema, cwd);
  const mergeMap = await readJsonFile(flags, 'map', ClusterMapSchema, cwd);
  const out = path.resolve(cwd, readRequired(flags, 'out'));

  const violations = validateClusters(lessons, mergeMap);
  if (violations.length > 0) {
    throw new CommandError('invalid-map', `the merge map has ${describeViolations(violations.length)}`, violations);
  }
  const map = combineMaps(batches, mergeMap);
  await writeJson(out, map);
  return { ok: true, out, clusters: map.clusters.length };
}

/** Validates every batch map and writes the batch clusters as a lesson inventory. */
export async function runLessons(flags: ParsedFlags, cwd: string): Promise<CommandResult> {
  const batches = await readBatches(flags, cwd);
  const out = path.resolve(cwd, readRequired(flags, 'out'));
  const result = buildLessonInventory(batches);
  if (!result.ok) {
    throw new CommandError(
      'invalid-map',
      `the batch maps have ${describeViolations(result.violations.length)}`,
      result.violations,
    );
  }
  await writeJson(out, result.lessons);
  return { ok: true, out, lessons: result.lessons.pool.length };
}

// region | Helpers

/** Reads every batch under `--batches` with the map beside it, throwing `file-not-found` for a missing map. */
async function readBatches(flags: ParsedFlags, cwd: string): Promise<ClusteredBatch[]> {
  const dir = path.resolve(cwd, readRequired(flags, 'batches'));
  let names: string[];
  try {
    names = await readdir(dir);
  } catch (error) {
    throw new CommandError('file-not-found', `could not read ${dir}: ${describeError(error)}`);
  }
  const batchNames = names.flatMap((name) => BATCH_FILE.exec(name)?.[1] ?? []).toSorted();
  if (batchNames.length === 0) {
    throw new CommandError('file-not-found', `${dir} does not contain any batch-NN.json file`);
  }
  const batches: ClusteredBatch[] = [];
  for (const name of batchNames) {
    const inventory = await readJsonPath(path.join(dir, `batch-${name}.json`), InventorySchema);
    const map = await readJsonPath(path.join(dir, `map-${name}.json`), ClusterMapSchema);
    batches.push({ name, inventory, map });
  }
  return batches;
}

// endregion | Helpers
