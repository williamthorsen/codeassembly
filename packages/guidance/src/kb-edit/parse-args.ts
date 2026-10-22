import { splitCommaList } from '../kb-shared/note-helpers.ts';
import { parseTagList } from '../kb-shared/tag-helpers.ts';
import { type FlagSpec, scanFlags } from '../lib/parse-flags.ts';
import type { OperationName, ParsedArgs } from './types.ts';

/** Operation flags, in the surface order that SKILL.md documents. */
const OPERATION_FLAGS = [
  { name: 'bump-updated', takesValue: false },
  { name: 'verify', takesValue: false },
  { name: 'append', takesValue: false },
  { name: 'retag', takesValue: true },
  { name: 'add-addressed-by', takesValue: true },
  { name: 'supersede-with', takesValue: true },
] as const satisfies readonly (FlagSpec & { name: OperationName })[];

/**
 * Parses the helper's argv: one or more positional `<path>` arguments plus exactly one operation flag. Throws on any
 * defect in it, and `runEdit` turns the throw into an `invalid-args` result.
 *
 * @internal - Exported to allow testing.
 */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  const scanned = scanArgv(argv);
  return composeParsedArgs(scanned);
}

// region | Helpers

/**
 * Validates the scanned argv shape and projects it onto the typed `ParsedArgs` union, including every per-operation
 * requirement: the value that a flag needs, and the number of positionals that it accepts.
 */
function composeParsedArgs(input: { positionals: string[]; selectedOps: SelectedOp[] }): ParsedArgs {
  const { positionals, selectedOps } = input;

  if (positionals.length === 0) {
    throw new Error('missing required <path> positional argument');
  }
  if (selectedOps.length === 0) {
    const flags = OPERATION_FLAGS.map((spec) => `--${spec.name}`).join(', ');
    throw new Error(`one operation flag is required (one of: ${flags})`);
  }
  if (selectedOps.length > 1) {
    const seen = selectedOps.map(({ name }) => `--${name}`).join(', ');
    throw new Error(`operation flags are mutually exclusive; got ${seen}`);
  }

  const [op] = selectedOps;
  if (op === undefined) {
    // Unreachable: Length checks above guarantee a single entry.
    throw new Error('internal error: missing operation after length checks');
  }

  switch (op.name) {
    case 'bump-updated':
    case 'verify':
    case 'append':
      return { operation: op.name, path: singlePositional(positionals) };
    case 'retag':
      if (op.value === null) {
        throw new Error('--retag requires a value');
      }
      return { operation: 'retag', path: singlePositional(positionals), tags: parseTagList(op.value) };
    case 'add-addressed-by': {
      if (op.value === null) {
        throw new Error('--add-addressed-by requires a value');
      }
      const references = splitCommaList(op.value);
      if (references.length === 0) {
        throw new Error('--add-addressed-by requires at least one reference');
      }
      return { operation: 'add-addressed-by', paths: positionals, references };
    }
    case 'supersede-with':
      // Reject an empty `--supersede-with` value here so that the helper reports it as a clear `invalid-args`, not a
      // confusing EISDIR downstream when `''` resolves to the start directory.
      if (op.value === null || op.value === '') {
        throw new Error('--supersede-with requires a value');
      }
      return { operation: 'supersede-with', path: singlePositional(positionals), newPath: op.value };
    default: {
      const _exhaustive: never = op.name;
      throw new Error(`unhandled operation: ${String(_exhaustive)}`);
    }
  }
}

/**
 * Separates positional `<path>` arguments from operation flags, capturing every one of each. `composeParsedArgs`
 * enforces arity.
 */
function scanArgv(argv: readonly string[]): { positionals: string[]; selectedOps: SelectedOp[] } {
  // An empty inline value passes through, because each operation decides for itself whether empty is meaningful.
  const { positionals, flags } = scanFlags(argv, OPERATION_FLAGS);
  const selectedOps: SelectedOp[] = flags.map((flag) => ({ name: flag.name, value: flag.value }));
  return { positionals, selectedOps };
}

/** A captured operation flag: its canonical name plus the value (if any) that followed it. */
interface SelectedOp {
  name: OperationName;
  value: string | null;
}

/** Returns the sole positional path for a single-target operation, rejecting a second one with a usage error. */
function singlePositional(positionals: string[]): string {
  const [first, second] = positionals;
  if (second !== undefined) {
    throw new Error(`unexpected extra positional argument: ${second}`);
  }
  if (first === undefined) {
    // Unreachable: The caller's length check guarantees at least one positional.
    throw new Error('missing required <path> positional argument');
  }
  return first;
}

// endregion | Helpers
