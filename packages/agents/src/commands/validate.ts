import process from 'node:process';

import { formatContentDefects } from '../lib/content-defects.ts';
import { validateContentRoot } from '../lib/content-validation.ts';
import { emitReport, printLine } from '../lib/emit-report.ts';
import { ALL_HARNESS_IDS } from '../lib/harness.ts';
import { resolveContentRoot } from '../lib/resolve-content-root.ts';
import type { HarnessId } from '../lib/types.ts';

/** What `validate` was asked to check: an explicit content root, and which harnesses to check it against. */
export interface ValidateOptions {
  readonly content?: string | undefined;
  readonly harness: HarnessId | 'all';
}

/**
 * Validates a content root and reports what it found, returning whether the root is clean. Returns a boolean rather
 * than throwing so that the caller can exit non-zero on a multi-line report without the CLI's top-level handler
 * prefixing it with `Error:`. The report is a list of findings, not one failure.
 */
export async function validateCommand(options: ValidateOptions, cwd: string = process.cwd()): Promise<boolean> {
  const root = await resolveContentRoot(options.content, cwd, 'validate');
  const harnessIds = options.harness === 'all' ? ALL_HARNESS_IDS : [options.harness];

  console.info(`Validating ${root} against ${harnessIds.join(', ')}`);
  const defects = await validateContentRoot(root, harnessIds);

  if (defects.length === 0) {
    printLine({ glyph: 'passed', level: 'info', text: 'No defects found.' });
    return true;
  }

  emitReport([
    { level: 'error', text: '' },
    { glyph: 'failed', level: 'error', text: `${defects.length} defect(s) found:` },
    { level: 'error', text: '' },
  ]);
  console.error(formatContentDefects(defects));
  return false;
}
