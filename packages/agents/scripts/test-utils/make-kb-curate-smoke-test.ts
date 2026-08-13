import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { CONTENT_DIR, resolveKbDir } from '@williamthorsen/kb/layout';

import { isRecord } from './is-record.ts';
import type { SmokeTestInvocation } from './smoke-test-invocation.ts';

/**
 * Stands up a fixture KB with a single seed note and returns a `SmokeTestInvocation` that runs the bundle read-only
 * over it. Exercises the resolve → enumerate → detect pipeline end to end. `HOME` is overridden to the fixture dir
 * so the dev's real registry does not pollute KB resolution.
 */
export function makeKbCurateSmokeTest(): SmokeTestInvocation {
  const fixtureDir = mkdtempSync(path.join(tmpdir(), 'kb-curate-smoke-'));
  mkdirSync(resolveKbDir(fixtureDir), { recursive: true });
  // The seed note lives under `content/` so the store's default `targets: ['content/**/*.md']` enumerates it; a note
  // at the store root would not match and the smoke test would silently report zero notes. The note links to a
  // missing target so a successful enumeration always yields a `wikilinks.unresolved` finding — the proof, below,
  // that the bundle enumerated the note rather than reporting an empty vault.
  mkdirSync(path.join(fixtureDir, CONTENT_DIR), { recursive: true });
  writeFileSync(
    path.join(fixtureDir, CONTENT_DIR, 'Smoke.md'),
    '---\ntitle: Smoke\nrecordType: assertion\ncreated: 2026-05-01\nupdated: 2026-05-01\ntags: [smoke]\ntype: howto\n---\n\nSee [[Missing target]].\n',
    'utf8',
  );
  return {
    args: [],
    cwd: fixtureDir,
    env: { ...process.env, HOME: fixtureDir },
    assertResult: assertKbCurateSmokeResult,
  };
}

// region | Helpers

/**
 * Asserts that the kb-curate smoke produced an ok read-only report that actually enumerated the seed note. The seed
 * note carries an unresolved wikilink, so a non-empty enumeration always surfaces a `wikilinks.unresolved` finding; its
 * absence means the bundle enumerated nothing — a broken `content/` scoping must fail here rather than pass with an
 * empty report.
 */
function assertKbCurateSmokeResult(result: unknown): void {
  if (!isRecord(result)) {
    throw new TypeError('expected object result from kb-curate');
  }
  if (result.ok !== true) {
    throw new Error(`expected ok: true, got ${JSON.stringify(result)}`);
  }
  if (result.mode !== 'report') {
    throw new Error(`expected mode 'report', got ${JSON.stringify(result.mode)}`);
  }
  if (!Array.isArray(result.findings)) {
    throw new TypeError(`expected findings to be an array, got ${JSON.stringify(result.findings)}`);
  }
  const rules = result.findings.map((entry: unknown) => (isRecord(entry) ? entry.rule : undefined));
  if (!rules.includes('wikilinks.unresolved')) {
    throw new Error(`expected the smoke run to enumerate the seed note; got rules: ${JSON.stringify(rules)}`);
  }
}

// endregion | Helpers
