import { mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { buildFakeRunner, type RunnerCall } from '../../test-utils/fake-runner.ts';
import type { CommandContext } from '../command.ts';
import { type ISSUES, NOW } from './issue-fixtures.ts';
import { makeFakeRepository } from './make-fake-repository.ts';
import { respond } from './respond.ts';

/**
 * Creates a temporary repository root and a command context whose fake runner answers `gh` with the issues that
 * `readIssues` returns at the time of each call.
 */
export function setUpCliFixture(readIssues: () => typeof ISSUES): CliFixture {
  const root = mkdtempSync(path.join(tmpdir(), 'groom-cli-'));
  const runner = buildFakeRunner((call) => respond(call, readIssues()));
  return {
    calls: runner.calls,
    context: { git: makeFakeRepository(root), now: NOW, root, run: runner.run, stdin: '' },
    root,
  };
}

/** Removes the temporary repository root that `setUpCliFixture` created. */
export async function tearDownCliFixture(root: string): Promise<void> {
  await rm(root, { recursive: true, force: true });
}

// region | Helpers

/** The temporary root, the command context, and the record of the fake runner's calls. */
interface CliFixture {
  calls: RunnerCall[];
  context: CommandContext;
  root: string;
}

// endregion | Helpers
