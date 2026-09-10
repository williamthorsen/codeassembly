import type { ChangeRecord, Taxonomy } from './types.ts';

/**
 * Reports the breaking-policy violation a record carries, or nothing where it carries none. The record is returned
 * untouched: normalizing a violation away would hide the mistake from the author who can still fix it.
 *
 * A type whose policy forbids the marker violates by carrying it; one whose policy requires it violates by omitting it.
 * A record naming a type the taxonomy does not declare carries no policy to break.
 */
export function validate(record: ChangeRecord, taxonomy: Taxonomy): PolicyViolation | undefined {
  const workType = taxonomy.types.find((candidate) => candidate.key === record.type);
  if (workType === undefined) {
    return undefined;
  }
  const policy = workType.breakingPolicy ?? 'optional';
  const breaking = record.breaking === true;

  if (policy === 'forbidden' && breaking) {
    return { policy, type: workType.key };
  }
  if (policy === 'required' && !breaking) {
    return { policy, type: workType.key };
  }
  return undefined;
}

/** A record whose breaking marker disagrees with its type's policy. */
export interface PolicyViolation {
  policy: 'forbidden' | 'required';
  type: string;
}
