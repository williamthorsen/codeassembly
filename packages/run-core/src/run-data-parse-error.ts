import type { core } from 'zod';

export type RunDataParseErrorCategory = 'corrupt_json' | 'invalid_schema' | 'missing_companion';

/**
 * Structured error for run-data parsing failures.
 *
 * Distinguishes known parse failures (corrupt JSON, schema mismatches,
 * missing companion files) from unexpected errors, so consumers can
 * downgrade known failures to informative warnings.
 */
export class RunDataParseError extends Error {
  readonly category: RunDataParseErrorCategory;
  readonly filePath: string;
  readonly zodIssues: core.$ZodIssue[] | undefined;

  constructor(
    message: string,
    category: RunDataParseErrorCategory,
    filePath: string,
    zodIssues?: core.$ZodIssue[],
  ) {
    super(message);
    this.name = 'RunDataParseError';
    this.category = category;
    this.filePath = filePath;
    this.zodIssues = zodIssues;
  }
}
