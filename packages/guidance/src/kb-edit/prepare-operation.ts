import { dirname, isAbsolute, resolve } from 'node:path';
import process from 'node:process';
import type { Readable } from 'node:stream';

import type { AliasMap, KbRoot } from '@williamthorsen/kb';
import { resolveKbDir } from '@williamthorsen/kb/layout';
import type { KbAssertion } from '@williamthorsen/kb/records';
import { loadAliases } from '@williamthorsen/kb/tags';
import { describeError } from '@williamthorsen/toolbelt.errors';

import { formatKbResolutionFailure } from '../kb-shared/format-kb-resolution-failure.ts';
import { discoverWritableKb, type ResolvedKb } from '../kb-shared/resolve-writable-kb.ts';
import { readAll } from '../lib/stream-helpers.ts';
import type { loadNote } from './load-note.ts';
import { append } from './operations/append.ts';
import { bumpUpdated } from './operations/bump-updated.ts';
import { retag } from './operations/retag.ts';
import { verify } from './operations/verify.ts';
import type { EditFailure, EditResult, ParsedArgs } from './types.ts';

/** Resolves a possibly-relative note path against the caller's start directory. */
export function absoluteNotePath(input: { path: string; startDir: string }): string {
  return isAbsolute(input.path) ? input.path : resolve(input.startDir, input.path);
}

/** Loads tag aliases for a resolved KB. */
export async function loadAliasesForKb(input: { kb: ResolvedKb }): Promise<AliasMap> {
  return loadAliasesWithWarning({ kbRoot: kbRootFor(input.kb) });
}

/** Translates a `loadNote` failure outcome into a top-level `EditResult`. */
export function loadFailureToResult(outcome: Exclude<Awaited<ReturnType<typeof loadNote>>, { ok: true }>): EditResult {
  if (outcome.reason === 'note-not-found') {
    return {
      ok: false,
      error: 'note-not-found',
      message: `file not found at ${outcome.path}`,
      details: { missingPath: outcome.path },
    };
  }
  return {
    ok: false,
    error: 'note-parse',
    message: `could not parse frontmatter at ${outcome.path}: ${outcome.parseError}`,
    details: { parseError: outcome.parseError },
  };
}

/** Dispatches an operation to its module and returns the prepared record, or a top-level failure. */
export async function prepareOperation(input: {
  args: Exclude<ParsedArgs, { operation: 'supersede-with' | 'add-addressed-by' }>;
  record: KbAssertion;
  aliases: AliasMap;
  now: Date;
  stdin: Readable;
}): Promise<PreparedOperation | { ok: false; failure: EditResult }> {
  const { record } = input;

  switch (input.args.operation) {
    case 'bump-updated':
      return { ok: true, record: bumpUpdated(record, input.now) };
    case 'verify':
      return { ok: true, record: verify(record, input.now) };
    case 'retag': {
      const result = retag(record, input.args.tags, input.aliases);
      return {
        ok: true,
        record: result.record,
        originalTags: result.originalTags,
        canonicalTags: result.canonicalTags,
      };
    }
    case 'append': {
      const addition = await readAll(input.stdin);
      const result = append(record, addition, input.now);
      if (!result.ok) {
        return { ok: false, failure: { ok: false, error: 'invalid-args', message: result.message } };
      }
      return { ok: true, record: result.record };
    }
    default: {
      const _exhaustive: never = input.args;
      throw new Error(`unhandled operation: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

/**
 * Resolves the writable KB that owns the note at `notePath`. The walk starts at the note's directory, so the KB
 * context depends on where the note is rather than on where the helper was invoked.
 */
export async function resolveKbForPath(input: {
  notePath: string;
  home?: string;
}): Promise<{ ok: true; kb: ResolvedKb } | { ok: false; failure: EditResult }> {
  const resolved = await discoverWritableKb({
    startDir: dirname(input.notePath),
    ...(input.home !== undefined && { home: input.home }),
  });
  if (resolved.ok) {
    return { ok: true, kb: resolved.kb };
  }
  switch (resolved.reason) {
    case 'missing-destination':
      return {
        ok: false,
        failure: {
          ok: false,
          error: 'missing-destination',
          message: `did not discover any .kb/ for note at ${input.notePath}`,
        },
      };
    case 'readonly-kb':
      return {
        ok: false,
        failure: {
          ok: false,
          error: 'readonly-kb',
          message: formatKbResolutionFailure(resolved),
          details: { readonlyKbName: resolved.kbName, readonlyKbPath: resolved.kbPath },
        },
      };
    default: {
      const _exhaustive: never = resolved;
      throw new Error(`unhandled discoverWritableKb failure: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

/** Builds the top-level `validation` failure for a record whose rendered frontmatter did not re-parse as an assertion. */
export function validationFailure(errors: string[]): EditFailure {
  return {
    ok: false,
    error: 'validation',
    message: `rendered frontmatter did not re-parse as an assertion: ${errors.join('; ')}`,
    details: { errors },
  };
}

// region | Helpers

/** Builds the `KbRoot` descriptor for a resolved KB. */
function kbRootFor(kb: ResolvedKb): KbRoot {
  return { path: kb.path, kbDir: resolveKbDir(kb.path) };
}

/**
 * Loads tag aliases, degrading a malformed or unreadable `tag-aliases.yaml` to an empty map and emitting a warning
 * to stderr so that the operator can see why canonicalization was skipped.
 */
async function loadAliasesWithWarning(input: { kbRoot: KbRoot }): Promise<AliasMap> {
  try {
    return await loadAliases({ kbRoot: input.kbRoot });
  } catch (error) {
    const message = describeError(error);
    process.stderr.write(`kb-edit: warning: could not load tag aliases: ${message}\n`);
    return new Map();
  }
}

interface PreparedOperation {
  ok: true;
  record: KbAssertion;
  originalTags?: string[];
  canonicalTags?: string[];
}

// endregion | Helpers
