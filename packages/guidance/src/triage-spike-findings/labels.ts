/** The graded label families that a child ticket has, and the check that a repository has them. */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { z } from 'zod';

import { CONFIDENCE_GRADES, VALUE_GRADES } from './schemas.ts';
import type { CommandRunner } from './types.ts';

/** Each family's labels, as the common preset of `release-kit sync-labels` spells them. */
export const LABEL_FAMILIES: Readonly<Record<'confidence' | 'value', readonly string[]>> = {
  confidence: CONFIDENCE_GRADES.map((grade) => `confidence:${grade}`),
  value: VALUE_GRADES.map((grade) => `value:${grade}`),
};

const execFileAsync = promisify(execFile);

/**
 * The most labels that one `gh label list` reads; a repository with more labels than that is beyond what the families
 * need.
 */
const LABEL_LIST_LIMIT = 500;

const LabelListSchema = z.array(z.object({ name: z.string() }));

/** One family's labels on the repository, split into the ones present and the ones missing. */
export interface FamilyStatus {
  missing: string[];
  present: string[];
}

/** The repository's standing against both families; `complete` is true only when every label is present. */
export interface LabelCheck {
  complete: boolean;
  families: Record<keyof typeof LABEL_FAMILIES, FamilyStatus>;
}

/** Reads the repository's labels through `gh` and reports each family's present and missing labels. */
export async function checkLabels(run: CommandRunner, root: string): Promise<LabelCheck> {
  const stdout = await run('gh', ['label', 'list', '--json', 'name', '--limit', String(LABEL_LIST_LIMIT)], root);
  const names = new Set(LabelListSchema.parse(JSON.parse(stdout)).map((label) => label.name));
  const families = {
    confidence: splitFamily(LABEL_FAMILIES.confidence, names),
    value: splitFamily(LABEL_FAMILIES.value, names),
  };
  const complete = families.confidence.missing.length === 0 && families.value.missing.length === 0;
  return { complete, families };
}

/** Runs `gh` through `execFile`, with a buffer large enough for a repository's whole label list. */
export const runCommand: CommandRunner = async (command, args, cwd) => {
  const { stdout } = await execFileAsync(command, [...args], { cwd, maxBuffer: 16 * 1_024 * 1_024 });
  return stdout;
};

// region | Helpers

/** Splits one family's labels by whether `names` contains them. */
function splitFamily(labels: readonly string[], names: ReadonlySet<string>): FamilyStatus {
  return {
    missing: labels.filter((label) => !names.has(label)),
    present: labels.filter((label) => names.has(label)),
  };
}

// endregion | Helpers
