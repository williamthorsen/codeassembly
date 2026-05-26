/**
 * Post-build smoke test: Build every skill helper bundle and run each `.mjs` under `node`, asserting it exits 0 and
 * prints valid JSON to stdout. Targets may provide a `smokeTest` clause to pipe a specific payload and assert on the
 * parsed result; targets without one are exercised with no args and empty stdin (the deterministic, side-effect-free
 * baseline).
 *
 * Unit tests run the TypeScript source through vitest and never exercise the bundled artifact. The bundle carries a
 * `createRequire` banner, the `format: 'esm'` option, and the `conditions: ['source']` resolution setting; a
 * regression to any of them would crash the installed helper at load time, undetected by the unit suite.
 * This test runs the built bundle exactly as an installed skill would.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

import {
  bundleSkillHelpers,
  type BundleTarget,
  packageRoot,
  type SmokeTestInvocation,
  targets,
} from './bundle-skill-helpers.ts';

await bundleSkillHelpers();

let failed = false;
for (const target of targets) {
  try {
    const stdout = await runBundle(target);
    const parsed: unknown = JSON.parse(stdout);
    target.smokeTest?.assertResult?.(parsed);
    console.info(`Smoke test passed: ${target.outFile} exits 0 with valid JSON.`);
  } catch (error) {
    failed = true;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Smoke test failed: ${target.outFile} — ${message}`);
  }
}

if (failed) {
  process.exitCode = 1;
}

/** Run the built bundle for `target` under node, returning its stdout. Throws on non-zero exit. */
async function runBundle(target: BundleTarget): Promise<string> {
  const bundlePath = path.join(packageRoot, target.outFile);
  const invocation: SmokeTestInvocation = target.smokeTest ?? {};
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
    child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));
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
