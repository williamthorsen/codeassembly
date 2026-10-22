import type { RunnerCall } from '../../test-utils/fake-runner.ts';
import { CLOSED_ISSUES, type ISSUES } from './issue-fixtures.ts';

/** Answers the fake runner's `gh` calls with the open `issues`, the closed issues, and a closing PR for #10. */
export function respond(call: RunnerCall, issues: typeof ISSUES): string | undefined {
  const [first, second] = call.args;
  if (first === 'repo') return JSON.stringify({ nameWithOwner: 'owner/repo', defaultBranchRef: { name: 'main' } });
  if (first === 'issue' && second === 'view') {
    const issue = [...issues, ...CLOSED_ISSUES].find((candidate) => String(candidate.number) === call.args[2]);
    return issue === undefined ? undefined : JSON.stringify(issue);
  }
  if (first === 'issue') return JSON.stringify(issues);
  if (first === 'pr') {
    return JSON.stringify([
      {
        number: 50,
        title: 'Fix the uploader',
        body: '',
        mergedAt: '2026-03-01T00:00:00Z',
        closingIssuesReferences: [{ number: 10, repository: { name: 'repo', owner: { login: 'owner' } } }],
      },
    ]);
  }
  return undefined;
}
