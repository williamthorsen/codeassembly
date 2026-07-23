import { parseRunData } from '../parsers/run-data-parser.ts';
import { RunDataParseError } from '../run-data-parse-error.ts';
import { isEnoent } from '../type-guards.ts';
import type { CanonicalRunStatus } from '../types/canonical.ts';

export type InvalidRunReason = 'missing run-index.json' | 'missing run-log.jsonl' | 'corrupt JSON' | 'invalid schema';

export interface ValidRunResult {
  valid: true;
  status: CanonicalRunStatus;
}

export interface InvalidRunResult {
  valid: false;
  reason: InvalidRunReason;
}

export type RunValidationResult = ValidRunResult | InvalidRunResult;

const CATEGORY_TO_REASON: Record<string, InvalidRunReason> = {
  corrupt_json: 'corrupt JSON',
  invalid_schema: 'invalid schema',
  missing_companion: 'missing run-log.jsonl',
};

/** Validates a run directory by attempting to parse its run data files. */
export async function validateRunDirectory(runPath: string): Promise<RunValidationResult> {
  try {
    const status = await parseRunData(runPath);
    return { valid: true, status };
  } catch (error) {
    if (isEnoent(error)) {
      return { valid: false, reason: 'missing run-index.json' };
    }
    if (error instanceof RunDataParseError) {
      const reason = CATEGORY_TO_REASON[error.category];
      if (reason) {
        return { valid: false, reason };
      }
    }
    throw error;
  }
}
