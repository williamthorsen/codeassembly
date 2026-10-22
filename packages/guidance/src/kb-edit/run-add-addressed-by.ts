import { loadNote } from './load-note.ts';
import { addAddressedBy } from './operations/add-addressed-by.ts';
import { absoluteNotePath, loadFailureToResult, resolveKbForPath, validationFailure } from './prepare-operation.ts';
import type { AddAddressedByResult, EditBatchSuccess, EditResult, ParsedArgs } from './types.ts';
import { writeBackNote } from './write-back.ts';

/**
 * Orchestrates `--add-addressed-by`: applies the same reference list to each target independently, so a recoverable
 * failure on one target becomes that record's result and the rest of the batch still runs. An unexpected throw
 * propagates to `main`.
 *
 * Because the operation doesn't add a duplicate reference, the batch doesn't need any cross-file rollback.
 */
export async function runAddAddressedBy(input: {
  args: Extract<ParsedArgs, { operation: 'add-addressed-by' }>;
  startDir: string;
  now: Date;
  home?: string;
}): Promise<EditBatchSuccess> {
  const results: AddAddressedByResult[] = [];
  for (const rawPath of input.args.paths) {
    const notePath = absoluteNotePath({ path: rawPath, startDir: input.startDir });
    results.push(
      await editOneAddressedBy({
        notePath,
        references: input.args.references,
        now: input.now,
        ...(input.home !== undefined && { home: input.home }),
      }),
    );
  }
  return { ok: true, operation: 'add-addressed-by', results };
}

// region | Helpers

/** Applies the addressed-by append to a single target, mapping any recoverable failure onto a per-record result. */
async function editOneAddressedBy(input: {
  notePath: string;
  references: readonly string[];
  now: Date;
  home?: string;
}): Promise<AddAddressedByResult> {
  const kbOutcome = await resolveKbForPath({
    notePath: input.notePath,
    ...(input.home !== undefined && { home: input.home }),
  });
  if (!kbOutcome.ok) {
    return toRecordFailure(input.notePath, kbOutcome.failure);
  }

  const loadOutcome = await loadNote({ path: input.notePath });
  if (!loadOutcome.ok) {
    return toRecordFailure(input.notePath, loadFailureToResult(loadOutcome));
  }

  const prepared = addAddressedBy(loadOutcome.record, input.references, input.now);

  const writeOutcome = await writeBackNote({ path: input.notePath, record: prepared });
  if (!writeOutcome.ok) {
    return toRecordFailure(input.notePath, validationFailure(writeOutcome.errors));
  }

  return { ok: true, path: input.notePath, kb: kbOutcome.kb, record: prepared };
}

/** Projects a top-level recoverable `EditFailure` onto a per-record failure entry, attaching the record's path. */
function toRecordFailure(path: string, failure: EditResult): Extract<AddAddressedByResult, { ok: false }> {
  if (failure.ok) {
    // Unreachable: The helpers that supply this function's input only return failures here.
    throw new Error(`internal error: expected a failure result for ${path}`);
  }
  return {
    ok: false,
    path,
    error: failure.error,
    message: failure.message,
    ...(failure.details !== undefined && { details: failure.details }),
  };
}

// endregion | Helpers
