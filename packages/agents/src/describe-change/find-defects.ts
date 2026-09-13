import type { ChangeRecord, Taxonomy } from '../change-grammar/types.ts';
import { validate } from '../change-grammar/validate.ts';

/** Reports the defect that blocks approval of an effective record, if any. */
export function findDefects(record: ChangeRecord, taxonomy: Taxonomy): RecordDefect[] {
  if (record.type === undefined) {
    return [{ kind: 'missing-type' }];
  }
  if (taxonomy.types.every((entry) => entry.key !== record.type)) {
    return [{ kind: 'undeclared-type', type: record.type }];
  }
  const violation = validate(record, taxonomy);
  return violation === undefined ? [] : [{ kind: 'policy-violation', policy: violation.policy, type: violation.type }];
}

/** A condition that blocks approval until the author overrides the record. */
export type RecordDefect =
  | { kind: 'missing-type' }
  | { kind: 'policy-violation'; policy: 'forbidden' | 'required'; type: string }
  | { kind: 'undeclared-type'; type: string };
