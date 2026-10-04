import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { isRecord } from './is-record.ts';
import type { SmokeTestInvocation } from './smoke-test-invocation.ts';

/**
 * Returns an invocation that converts a Markdown task list to ADF, which exercises the bundled Markdown converter
 * without reaching Jira.
 */
export function makeManageJiraTicketSmokeTest(): SmokeTestInvocation {
  const dir = mkdtempSync(path.join(tmpdir(), 'manage-jira-ticket-smoke-'));
  const bodyFile = path.join(dir, 'body.md');
  writeFileSync(bodyFile, '## Acceptance criteria\n\n- [ ] works\n');

  return {
    args: ['convert-body', '--body-file', bodyFile, '--out', path.join(dir, 'body.adf.json')],
    assertResult: assertTaskListWritten,
  };
}

// region | Helpers

/** Asserts that the result names the ADF file and that the file contains a `taskList` node. */
function assertTaskListWritten(result: unknown): void {
  if (!isRecord(result) || typeof result.adfPath !== 'string') {
    throw new TypeError(`expected { adfPath }, got ${JSON.stringify(result)}`);
  }
  const adf: unknown = JSON.parse(readFileSync(result.adfPath, 'utf8'));
  const content = isRecord(adf) && Array.isArray(adf.content) ? adf.content : [];
  if (content.every((node) => !(isRecord(node) && node.type === 'taskList'))) {
    throw new Error('expected the ADF to contain a taskList node');
  }
}

// endregion | Helpers
