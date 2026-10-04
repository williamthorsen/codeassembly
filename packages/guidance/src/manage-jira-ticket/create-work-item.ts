import { isRecord } from '../lib/type-guards.ts';

/** The exit code and output of one `acli` invocation. */
export interface AcliResult {
  exitCode: number;
  stderr: string;
  stdout: string;
}

/** Runs `acli` with the given arguments, without a shell. */
export type RunAcli = (args: readonly string[]) => Promise<AcliResult>;

/** What a create call submits. The description is an ADF file that the caller has already written. */
export interface CreateRequest {
  adfPath: string;
  issueType: string;
  parent: string | undefined;
  projectKey: string;
  summary: string;
}

/** The fields reported for every run that reached the create call. `key` is null when it could not be read. */
export interface CreateResult {
  key: string | null;
  parentSkipped: boolean;
  rawOutput: string;
}

/** A create run's result, and the diagnostics to report on stderr. `ok` is false when the result has no key. */
export interface CreateOutcome {
  diagnostics: string[];
  ok: boolean;
  result: CreateResult;
}

/**
 * Creates one Jira work item through `acli`. A requested parent is checked first with `acli jira workitem view`, and a
 * parent that the check rejects is dropped and reported as skipped rather than failing the create, which is the only
 * call that can set one.
 *
 * The create command runs exactly once. When it fails, or its output does not yield a top-level `key`, the outcome is
 * not ok and carries the raw output, from which the caller reads the key: A second create would duplicate the item.
 */
export async function createWorkItem(request: CreateRequest, runAcli: RunAcli): Promise<CreateOutcome> {
  const diagnostics: string[] = [];

  let parentSkipped = false;
  if (request.parent !== undefined) {
    const view = await runAcli(['jira', 'workitem', 'view', request.parent]);
    if (view.exitCode !== 0) {
      parentSkipped = true;
      diagnostics.push(
        `parent ${request.parent} rejected by acli (exit ${view.exitCode}); creating without it: ${view.stderr.trim()}`,
      );
    }
  }

  const args = [
    'jira',
    'workitem',
    'create',
    '--project',
    request.projectKey,
    '--type',
    request.issueType,
    '--summary',
    request.summary,
    '--description-file',
    request.adfPath,
    '--json',
  ];
  if (request.parent !== undefined && !parentSkipped) {
    args.push('--parent', request.parent);
  }
  const created = await runAcli(args);

  if (created.exitCode !== 0) {
    diagnostics.push(
      `acli jira workitem create exited ${created.exitCode}; check Jira before creating again: ${created.stderr.trim()}`,
    );
    return { diagnostics, ok: false, result: { key: null, parentSkipped, rawOutput: created.stdout } };
  }

  const key = parseKey(created.stdout);
  if (key === null) {
    diagnostics.push(
      'could not read a key from the acli create output; read it from rawOutput and do not create again',
    );
  }
  return { diagnostics, ok: key !== null, result: { key, parentSkipped, rawOutput: created.stdout } };
}

// region | Helpers

/** Reads the top-level `key` from `acli`'s JSON output, or null when the output is not an object with a string key. */
function parseKey(stdout: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return null;
  }
  return isRecord(parsed) && typeof parsed.key === 'string' && parsed.key !== '' ? parsed.key : null;
}

// endregion | Helpers
