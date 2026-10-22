import { commitSupersede } from './commit-supersede.ts';
import { loadNote } from './load-note.ts';
import { prepareSupersedeWith } from './operations/supersede-with.ts';
import {
  absoluteNotePath,
  loadAliasesForKb,
  loadFailureToResult,
  resolveKbForPath,
  validationFailure,
} from './prepare-operation.ts';
import type { EditResult, EditSupersedeSuccess, ParsedArgs } from './types.ts';
import { renderGuarded } from './write-back.ts';

/**
 * Orchestrates `--supersede-with`: validates that both paths name notes in the same KB, then commits both writes
 * through `commitSupersede`.
 */
export async function runSupersedeWith(input: {
  args: Extract<ParsedArgs, { operation: 'supersede-with' }>;
  startDir: string;
  now: Date;
  home?: string;
}): Promise<EditResult> {
  const oldPath = absoluteNotePath({ path: input.args.path, startDir: input.startDir });
  const newPath = absoluteNotePath({ path: input.args.newPath, startDir: input.startDir });

  if (oldPath === newPath) {
    return {
      ok: false,
      error: 'invalid-args',
      message: `supersede chain requires distinct paths; got the same path for old and new: ${oldPath}`,
    };
  }

  const oldKb = await resolveKbForPath({ notePath: oldPath, ...(input.home !== undefined && { home: input.home }) });
  if (!oldKb.ok) {
    return oldKb.failure;
  }
  const newKb = await resolveKbForPath({ notePath: newPath, ...(input.home !== undefined && { home: input.home }) });
  if (!newKb.ok) {
    return newKb.failure;
  }
  if (oldKb.kb.path !== newKb.kb.path) {
    return {
      ok: false,
      error: 'invalid-args',
      message: `supersede chain requires both notes in the same KB; old is in ${oldKb.kb.path}, new is in ${newKb.kb.path}`,
    };
  }

  const oldLoad = await loadNote({ path: oldPath });
  if (!oldLoad.ok) {
    return loadFailureToResult(oldLoad);
  }
  const newLoad = await loadNote({ path: newPath });
  if (!newLoad.ok) {
    if (newLoad.reason === 'note-not-found') {
      return {
        ok: false,
        error: 'supersede-target-missing',
        message: `--supersede-with target does not exist: ${newPath}`,
        details: { missingPath: newPath },
      };
    }
    return loadFailureToResult(newLoad);
  }

  const aliases = await loadAliasesForKb({ kb: oldKb.kb });

  const prepared = prepareSupersedeWith({
    oldRecord: oldLoad.record,
    oldPath,
    newRecord: newLoad.record,
    newPath,
    kbPath: oldKb.kb.path,
    aliases,
    now: input.now,
  });

  const oldRendered = renderGuarded(prepared.old);
  const newRendered = renderGuarded(prepared.new);
  if (!oldRendered.ok || !newRendered.ok) {
    const errors = [...(oldRendered.ok ? [] : oldRendered.errors), ...(newRendered.ok ? [] : newRendered.errors)];
    return validationFailure(errors);
  }

  const commitOutcome = await commitSupersede({
    oldPath,
    newPath,
    oldOriginalContent: oldLoad.content,
    oldNewContent: oldRendered.content,
    newNewContent: newRendered.content,
  });
  if (!commitOutcome.ok) {
    return {
      ok: false,
      error: 'partial-supersede',
      message: `supersede-with: failed to commit and could not roll back; both notes may be in an inconsistent state. Original error: ${commitOutcome.message}`,
      details: { oldPath, newPath },
    };
  }

  const success: EditSupersedeSuccess = {
    ok: true,
    operation: 'supersede-with',
    oldPath,
    newPath,
    kb: oldKb.kb,
    oldRecord: prepared.old,
    newRecord: prepared.new,
  };
  return success;
}
