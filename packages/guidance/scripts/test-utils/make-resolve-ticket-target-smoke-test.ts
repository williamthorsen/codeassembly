import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { isRecord } from './is-record.ts';
import type { SmokeTestInvocation } from './smoke-test-invocation.ts';

/**
 * Puts a `gh` stand-in first on `PATH`, then returns an invocation that resolves `acme/widgets` through it. The stand-in
 * reports the repository, serves its label map, and returns 404 for its preferences file, so the run exercises a fetch
 * and a missing file without contacting GitHub.
 */
export function makeResolveTicketTargetSmokeTest(): SmokeTestInvocation {
  const binDir = mkdtempSync(path.join(tmpdir(), 'resolve-ticket-target-bin-'));
  const ghPath = path.join(binDir, 'gh');
  const script = [
    `#!${process.execPath}`,
    'const endpoint = process.argv[3];',
    String.raw`if (endpoint === 'repos/acme/widgets') { process.stdout.write('acme/widgets\n'); }`,
    'else if (endpoint.endsWith(\'/.meta/label-map.json\')) { process.stdout.write(\'{"scopes":{},"types":{}}\'); }',
    'else { process.stdout.write(\'{"message":"Not Found","status":"404"}\'); process.exit(1); }',
  ].join('\n');
  writeFileSync(ghPath, `${script}\n`);
  chmodSync(ghPath, 0o755);

  return {
    args: ['--repo', 'acme/widgets'],
    env: { ...process.env, PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ''}` },
    assertResult: assertPreferencesMissing,
  };
}

// region | Helpers

/** Asserts that the parsed result names the repository and reports its preferences file missing. */
function assertPreferencesMissing(result: unknown): void {
  if (!isRecord(result)) {
    throw new TypeError('expected object result');
  }
  if (result.repo !== 'acme/widgets' || result.projectSlug !== 'widgets') {
    throw new Error(`expected repo acme/widgets with slug widgets, got ${JSON.stringify(result)}`);
  }
  if (JSON.stringify(result.missing) !== JSON.stringify(['.agents/preferences.yaml'])) {
    throw new Error(`expected missing [.agents/preferences.yaml], got ${JSON.stringify(result.missing)}`);
  }
}

// endregion | Helpers
