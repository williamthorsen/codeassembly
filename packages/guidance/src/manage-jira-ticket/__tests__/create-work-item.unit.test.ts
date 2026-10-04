import { describe, expect, it } from 'vitest';

import { type AcliResult, type CreateRequest, createWorkItem } from '../create-work-item.ts';

const REQUEST: CreateRequest = {
  adfPath: '/scratch/description.json',
  issueType: 'Task',
  parent: undefined,
  projectKey: 'ABC',
  summary: 'Add the thing',
};

const CREATE_ARGS = [
  'jira',
  'workitem',
  'create',
  '--project',
  'ABC',
  '--type',
  'Task',
  '--summary',
  'Add the thing',
  '--description-file',
  '/scratch/description.json',
  '--json',
];

describe(createWorkItem, () => {
  it('creates the work item once and reads the key from the JSON output', async () => {
    const acli = fakeAcli({ create: ok('{"key":"ABC-12","id":"10001"}') });

    const outcome = await createWorkItem(REQUEST, acli.run);

    expect(acli.calls).toEqual([CREATE_ARGS]);
    expect(outcome).toEqual({
      diagnostics: [],
      ok: true,
      result: { key: 'ABC-12', parentSkipped: false, rawOutput: '{"key":"ABC-12","id":"10001"}' },
    });
  });

  it('passes a parent that the pre-flight accepts to the create call', async () => {
    const acli = fakeAcli({ create: ok('{"key":"ABC-13"}'), view: ok('{"key":"ABC-1"}') });

    const outcome = await createWorkItem({ ...REQUEST, parent: 'ABC-1' }, acli.run);

    expect(acli.calls).toEqual([
      ['jira', 'workitem', 'view', 'ABC-1'],
      [...CREATE_ARGS, '--parent', 'ABC-1'],
    ]);
    expect(outcome.result.parentSkipped).toBe(false);
  });

  it('creates the work item without a parent that the pre-flight rejects, and reports the skip', async () => {
    const acli = fakeAcli({ create: ok('{"key":"ABC-14"}'), view: { exitCode: 1, stderr: 'not found', stdout: '' } });

    const outcome = await createWorkItem({ ...REQUEST, parent: 'ABC-999' }, acli.run);

    expect(acli.calls).toEqual([['jira', 'workitem', 'view', 'ABC-999'], CREATE_ARGS]);
    expect(outcome.ok).toBe(true);
    expect(outcome.result).toEqual({ key: 'ABC-14', parentSkipped: true, rawOutput: '{"key":"ABC-14"}' });
    expect(outcome.diagnostics).toEqual([expect.stringContaining('parent ABC-999 rejected')]);
  });

  it('reports unparseable create output without running the create again', async () => {
    const acli = fakeAcli({ create: ok('✓ Work item ABC-15 created') });

    const outcome = await createWorkItem(REQUEST, acli.run);

    expect(acli.calls).toEqual([CREATE_ARGS]);
    expect(outcome.ok).toBe(false);
    expect(outcome.result).toEqual({ key: null, parentSkipped: false, rawOutput: '✓ Work item ABC-15 created' });
  });

  it('reports JSON output without a top-level key as unparsed', async () => {
    const acli = fakeAcli({ create: ok('{"data":{"key":"ABC-16"}}') });

    const outcome = await createWorkItem(REQUEST, acli.run);

    expect(acli.calls).toHaveLength(1);
    expect(outcome.result.key).toBeNull();
  });

  it('reports a failed create without running it again', async () => {
    const acli = fakeAcli({ create: { exitCode: 2, stderr: 'issue type not found', stdout: '' } });

    const outcome = await createWorkItem(REQUEST, acli.run);

    expect(acli.calls).toEqual([CREATE_ARGS]);
    expect(outcome.ok).toBe(false);
    expect(outcome.diagnostics).toEqual([expect.stringContaining('issue type not found')]);
  });
});

// region | Helpers

/** Builds an `acli` stand-in that records each call and answers `view` and `create` from the given results. */
function fakeAcli(results: { create: AcliResult; view?: AcliResult }) {
  const calls: string[][] = [];
  function run(args: readonly string[]): Promise<AcliResult> {
    calls.push([...args]);
    const result = args[2] === 'view' ? results.view : results.create;
    if (result === undefined) {
      return Promise.reject(new Error(`unexpected acli call: ${args.join(' ')}`));
    }
    return Promise.resolve(result);
  }
  return { calls, run };
}

/** Builds a successful `acli` result with the given stdout. */
function ok(stdout: string): AcliResult {
  return { exitCode: 0, stderr: '', stdout };
}

// endregion | Helpers
