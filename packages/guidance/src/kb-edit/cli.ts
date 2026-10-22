/* eslint n/no-process-exit: off -- CLI entry point: The process must exit with the helper's resolved exit code, and `main` runs only behind the `isEntryPoint()` guard, never on import as a library. */
/* eslint unicorn/no-process-exit: off -- same as above. */
import process from 'node:process';
import type { Readable } from 'node:stream';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { isEntryPoint } from '../lib/is-entry-point.ts';
import { loadNote } from './load-note.ts';
import { parseArgs } from './parse-args.ts';
import {
  absoluteNotePath,
  loadAliasesForKb,
  loadFailureToResult,
  prepareOperation,
  resolveKbForPath,
  validationFailure,
} from './prepare-operation.ts';
import { runAddAddressedBy } from './run-add-addressed-by.ts';
import { runSupersedeWith } from './run-supersede-with.ts';
import type { EditResult, EditSingleSuccess, ParsedArgs } from './types.ts';
import { writeBackNote } from './write-back.ts';

/** Executes the helper from `process.argv` and writes the JSON result to stdout. */
async function main(): Promise<void> {
  try {
    const result = await runEdit({
      argv: process.argv.slice(2),
      stdin: process.stdin,
      startDir: process.cwd(),
      now: new Date(),
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    const message = describeError(error);
    process.stderr.write(`kb-edit: ${message}\n`);
    process.exit(1);
  }
}

if (isEntryPoint(import.meta.url, 'kb-edit')) {
  await main();
}

/**
 * Runs the helper end to end, from argv to the note written back.
 *
 * A recoverable failure returns a structured `{ ok: false, ... }` result; a system failure propagates to `main`.
 *
 * @internal - Exported to allow testing.
 */
export async function runEdit(input: {
  argv: readonly string[];
  stdin: Readable;
  startDir: string;
  now: Date;
  home?: string;
}): Promise<EditResult> {
  let args: ParsedArgs;
  try {
    args = parseArgs(input.argv);
  } catch (error) {
    return {
      ok: false,
      error: 'invalid-args',
      message: describeError(error),
    };
  }

  if (args.operation === 'supersede-with') {
    return runSupersedeWith({
      args,
      startDir: input.startDir,
      now: input.now,
      ...(input.home !== undefined && { home: input.home }),
    });
  }

  if (args.operation === 'add-addressed-by') {
    return runAddAddressedBy({
      args,
      startDir: input.startDir,
      now: input.now,
      ...(input.home !== undefined && { home: input.home }),
    });
  }

  const notePath = absoluteNotePath({ path: args.path, startDir: input.startDir });

  const kbOutcome = await resolveKbForPath({ notePath, ...(input.home !== undefined && { home: input.home }) });
  if (!kbOutcome.ok) {
    return kbOutcome.failure;
  }

  const loadOutcome = await loadNote({ path: notePath });
  if (!loadOutcome.ok) {
    return loadFailureToResult(loadOutcome);
  }

  const aliases = await loadAliasesForKb({ kb: kbOutcome.kb });

  const prepared = await prepareOperation({
    args,
    record: loadOutcome.record,
    aliases,
    now: input.now,
    stdin: input.stdin,
  });
  if (!prepared.ok) {
    return prepared.failure;
  }

  const writeOutcome = await writeBackNote({ path: notePath, record: prepared.record });
  if (!writeOutcome.ok) {
    return validationFailure(writeOutcome.errors);
  }

  const success: EditSingleSuccess = {
    ok: true,
    operation: args.operation,
    path: notePath,
    kb: kbOutcome.kb,
    record: prepared.record,
  };
  if (prepared.originalTags !== undefined) {
    success.originalTags = prepared.originalTags;
  }
  if (prepared.canonicalTags !== undefined) {
    success.canonicalTags = prepared.canonicalTags;
  }
  return success;
}
