import type { ChangeRecord, Taxonomy } from '../change-grammar/types.ts';
import { validate } from '../change-grammar/validate.ts';
import type { ChangeEntry } from './change-entries.ts';

/** Reports the defect that blocks approval of an effective record, if any. */
export function findDefects(record: ChangeRecord, taxonomy: Taxonomy): RecordDefect[] {
  if (record.type === undefined) {
    return [{ kind: 'missing-type' }];
  }
  const defect = findTypeDefect({ breaking: record.breaking === true, type: record.type }, taxonomy);
  return defect === undefined ? [] : [defect];
}

/**
 * Reports each change entry whose type the taxonomy does not declare or whose breaking marker breaks its type's policy,
 * in entry order, naming the entry by its 0-based index.
 */
export function findEntryDefects(entries: readonly ChangeEntry[], taxonomy: Taxonomy): RecordDefect[] {
  return entries.flatMap((entry, index) => {
    const defect = findTypeDefect(entry, taxonomy);
    return defect === undefined ? [] : [{ ...defect, entry: index }];
  });
}

/**
 * A condition that blocks approval until the author settles it. A defect that names an `entry` is settled by amending
 * that change entry; any other, by overriding the effective record.
 */
export type RecordDefect =
  | { kind: 'missing-type' }
  | { entry?: number; kind: 'policy-violation'; policy: 'forbidden'; type: string }
  | { entry?: number; kind: 'undeclared-type'; type: string };

// region | Helpers

/** Reports a type that the taxonomy does not declare, or a marker that breaks the declared type's policy. */
function findTypeDefect(
  record: { breaking: boolean; type: string },
  taxonomy: Taxonomy,
): Exclude<RecordDefect, { kind: 'missing-type' }> | undefined {
  if (taxonomy.types.every((entry) => entry.key !== record.type)) {
    return { kind: 'undeclared-type', type: record.type };
  }
  const violation = validate(record, taxonomy);
  return violation === undefined
    ? undefined
    : { kind: 'policy-violation', policy: violation.policy, type: violation.type };
}

// endregion | Helpers
