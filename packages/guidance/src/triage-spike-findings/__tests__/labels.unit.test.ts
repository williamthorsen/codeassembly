import { describe, expect, it } from 'vitest';

import { buildFakeRunner } from '../../test-utils/fake-runner.ts';
import { checkLabels, LABEL_FAMILIES } from '../labels.ts';

/** Renders a `gh label list --json name` response for `names`. */
function listLabels(names: readonly string[]): string {
  return JSON.stringify(names.map((name) => ({ name })));
}

describe(checkLabels, () => {
  it('reports both families complete when the repository has every label', async () => {
    const runner = buildFakeRunner(() => listLabels([...LABEL_FAMILIES.confidence, ...LABEL_FAMILIES.value, 'bug']));

    const check = await checkLabels(runner.run, '/repo');

    expect(check.complete).toBe(true);
    expect(check.families.confidence.missing).toEqual([]);
    expect(check.families.value.missing).toEqual([]);
    expect(runner.calls).toEqual([{ command: 'gh', args: ['label', 'list', '--json', 'name', '--limit', '500'] }]);
  });

  it('names each missing label of a family that is partly present', async () => {
    const runner = buildFakeRunner(() => listLabels([...LABEL_FAMILIES.value, 'confidence:high']));

    const check = await checkLabels(runner.run, '/repo');

    expect(check.complete).toBe(false);
    expect(check.families.confidence).toEqual({
      missing: ['confidence:low', 'confidence:medium'],
      present: ['confidence:high'],
    });
  });

  it('rejects when gh fails', async () => {
    const runner = buildFakeRunner(() => undefined);

    await expect(checkLabels(runner.run, '/repo')).rejects.toThrow('fake runner');
  });
});
