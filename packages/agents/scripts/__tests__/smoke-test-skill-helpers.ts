/**
 * Post-build smoke test: Build every skill helper bundle and run each `.mjs` under `node`, asserting it exits 0 and
 * prints valid JSON to stdout. A bundle listed in `smokeTests` runs with its paired invocation — specific args, piped
 * stdin, and a structural assertion; a bundle without one is exercised with no args and empty stdin (the deterministic,
 * side-effect-free baseline).
 *
 * Unit tests run the TypeScript source through vitest and never exercise the bundled artifact. The bundle carries a
 * `createRequire` banner, the `format: 'esm'` option, and the `conditions: ['source']` resolution setting; a
 * regression to any of them would crash the installed helper at load time, undetected by the unit suite.
 * This test runs the built bundle exactly as an installed skill would.
 *
 * The bundles are built into a temporary copy of the content tree, so a test run leaves the tracked bundles under
 * `content/` as they were committed and the drift check keeps a comparison to make. The copy carries the tree's other
 * files because a helper resolves its data relative to its own location, the way an installed skill directory does.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { bundleSkillHelpers, type BundleTarget, packageRoot, targets } from '../bundle-skill-helpers.ts';
import { makeCaptureEventSmokeTest } from '../test-utils/make-capture-event-smoke-test.ts';
import { makeDeriveSessionContextSmokeTest } from '../test-utils/make-derive-session-context-smoke-test.ts';
import { makeEmitEventSmokeTest } from '../test-utils/make-emit-event-smoke-test.ts';
import { makeFeedbackMemoriesSmokeTest } from '../test-utils/make-feedback-memories-smoke-test.ts';
import { makeKbCurateSmokeTest } from '../test-utils/make-kb-curate-smoke-test.ts';
import { makeKbEditSmokeTest } from '../test-utils/make-kb-edit-smoke-test.ts';
import { makeKbRetrieveEventsSmokeTest } from '../test-utils/make-kb-retrieve-events-smoke-test.ts';
import { makeKbUpdateEventsSmokeTest } from '../test-utils/make-kb-update-events-smoke-test.ts';
import { makeRelayHookEventSmokeTest } from '../test-utils/make-relay-hook-event-smoke-test.ts';
import { makeSelectLedeExemplarsSmokeTest } from '../test-utils/make-select-lede-exemplars-smoke-test.ts';
import { makeUpdateJiraTicketSmokeTest } from '../test-utils/make-update-jira-ticket-smoke-test.ts';
import type { SmokeTestInvocation } from '../test-utils/smoke-test-invocation.ts';

// Each bundle that needs a non-default smoke run, keyed by its `entry`; a bundle absent here runs with no args and
// empty stdin. The builders run here, not on import of the utilities module, so building a bundle never triggers
// fixture setup.
const smokeTests: Record<string, SmokeTestInvocation> = {
  'src/capture-event/cli.ts': makeCaptureEventSmokeTest(),
  'src/derive-session-context/cli.ts': makeDeriveSessionContextSmokeTest(),
  'src/emit-event/cli.ts': makeEmitEventSmokeTest(),
  'src/feedback-memories/cli.ts': makeFeedbackMemoriesSmokeTest(),
  'src/kb-curate/cli.ts': makeKbCurateSmokeTest(),
  'src/kb-edit/cli.ts': makeKbEditSmokeTest(),
  'src/kb-retrieve-events/cli.ts': makeKbRetrieveEventsSmokeTest(),
  'src/kb-update-events/cli.ts': makeKbUpdateEventsSmokeTest(),
  'src/relay-hook-event/cli.ts': makeRelayHookEventSmokeTest(),
  'src/select-lede-exemplars/cli.ts': makeSelectLedeExemplarsSmokeTest(),
  'src/update-jira-ticket/cli.ts': makeUpdateJiraTicketSmokeTest(),
};

// Fail loudly if a pairing no longer matches a bundle, rather than silently never running it.
const knownEntries = new Set(targets.map((target) => target.entry));
for (const entry of Object.keys(smokeTests)) {
  if (!knownEntries.has(entry)) {
    throw new Error(`smokeTests references unknown bundle entry: ${entry}`);
  }
}

const bundleRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-helper-smoke-'));
fs.cpSync(path.join(packageRoot, 'content'), path.join(bundleRoot, 'content'), {
  filter: (source) => !source.endsWith('.mjs'),
  recursive: true,
});
await bundleSkillHelpers(bundleRoot);

let failed = false;
for (const target of targets) {
  const invocation = smokeTests[target.entry] ?? {};
  try {
    const stdout = await runBundle(target, invocation);
    const parsed: unknown = JSON.parse(stdout);
    invocation.assertResult?.(parsed);
    console.info(`Smoke test passed: ${target.outFile} exits 0 with valid JSON.`);
  } catch (error) {
    failed = true;
    const message = describeError(error);
    console.error(`Smoke test failed: ${target.outFile} — ${message}`);
  }
}

fs.rmSync(bundleRoot, { force: true, recursive: true });

if (failed) {
  process.exitCode = 1;
}

/** Run the built bundle for `target` under node with `invocation`, returning its stdout. Throws on non-zero exit. */
async function runBundle(target: BundleTarget, invocation: SmokeTestInvocation): Promise<string> {
  const bundlePath = path.join(bundleRoot, target.outFile);
  const args = invocation.args ?? [];

  return new Promise<string>((resolve, reject) => {
    // Pass `cwd` and `env` only when supplied so existing entries continue to inherit the parent's environment.
    const spawnOptions: { cwd?: string; env?: NodeJS.ProcessEnv } = {
      ...(invocation.cwd !== undefined && { cwd: invocation.cwd }),
      ...(invocation.env !== undefined && { env: invocation.env }),
    };
    const child = spawn(process.execPath, [bundlePath, ...args], spawnOptions);
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => {
      stdoutChunks.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderrChunks.push(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      const stdout = Buffer.concat(stdoutChunks).toString('utf8');
      const stderr = Buffer.concat(stderrChunks).toString('utf8');
      if (code !== 0) {
        reject(new Error(`exited with code ${code}; stderr: ${stderr.trim()}`));
        return;
      }
      resolve(stdout);
    });

    if (invocation.stdin !== undefined) {
      child.stdin.write(invocation.stdin);
    }
    child.stdin.end();
  });
}
