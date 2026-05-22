/**
 * Post-build smoke test: build every skill helper bundle and run each `.mjs` under `node`, asserting it
 * exits 0 and prints valid JSON to stdout.
 *
 * Unit tests run the TypeScript source through vitest and never exercise the bundled artifact. The
 * bundle carries a `createRequire` banner, the `format: 'esm'` option, and the `conditions: ['source']`
 * resolution setting; a regression to any of them would crash the installed helper at load time,
 * undetected by the unit suite. This test runs the built bundle exactly as an installed skill would.
 */
import { execFile } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';

import { bundleSkillHelpers, packageRoot, targets } from './bundle-skill-helpers.ts';

const execFileAsync = promisify(execFile);

await bundleSkillHelpers();

let failed = false;
for (const target of targets) {
  const bundlePath = path.join(packageRoot, target.outFile);
  try {
    // An empty argv yields the `no query provided` diagnostic — a deterministic, side-effect-free run.
    const { stdout } = await execFileAsync(process.execPath, [bundlePath]);
    JSON.parse(stdout);
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
