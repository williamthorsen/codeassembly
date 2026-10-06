import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * The deployed bundle, executed as a process.
 *
 * Every other suite imports the modules and calls them directly, which completes module evaluation before the call.
 * Only a real invocation runs the top-level entry-point guard, so only this suite can catch a module-level declaration
 * ordered after it, or a bundling failure that leaves the entry point unable to run at all.
 */
const BUNDLE = new URL('../skills/groom-backlog/groom-backlog.mjs', import.meta.url).pathname;

const REPLY = {
  number: 10,
  title: 'Ticket',
  verdicts: {
    drift: 'partial',
    relevance: 'relevant',
    progress: 'none',
    advisability: 'advisable',
    complexity: 'mechanical',
  },
  evidence: { drift: ['Moved'], relevance: [], progress: [], advisability: [], complexity: [] },
  markdown: '## Assessment: Ticket (#10)',
  recommendation: 'update',
  rule: null,
  remainder: [],
  confidence: 'medium',
  reason: 'The path moved.',
  relatedTickets: [],
  references: [],
  dependsOn: null,
  overlaps: [],
  draft: { sections: [{ heading: 'Context', body: 'The uploader lives in `src/transport/`.' }], children: [] },
};

describe('the deployed bundle', () => {
  let scratch: string;

  beforeEach(async () => {
    scratch = await mkdtemp(path.join(tmpdir(), 'groom-backlog-bundle-'));
    execFileSync('git', ['-C', scratch, 'init', '--quiet']);
    execFileSync('git', [
      '-C',
      scratch,
      '-c',
      'user.name=T',
      '-c',
      'user.email=t@example.com',
      'commit',
      '--quiet',
      '--allow-empty',
      '-m',
      'Init',
    ]);
    await writeFile(
      path.join(scratch, 'ticket.json'),
      JSON.stringify({ number: 10, updatedAt: '2026-01-01T00:00:00Z', inProgress: null }),
    );
  });

  afterEach(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  it('ingests a reply, renders the digest, and renders a comment', async () => {
    expect(run(['ingest', '--run', 'r', '--ticket', 'ticket.json'], JSON.stringify(REPLY))).toMatchObject({
      ok: true,
      class: 'escalate',
    });
    expect(run(['digest', '--run', 'r'])).toMatchObject({ ok: true, total: 1 });
    expect(
      run(['comment', '--run', 'r', '--number', '10', '--decision', 'update', '--decided-by', 'user', '--out', 'c.md']),
    ).toMatchObject({ ok: true });

    const comment = await readFile(path.join(scratch, 'c.md'), 'utf8');
    expect(comment).toContain('<!-- codeassembly-triage {"run":"r"');
  });

  it('appends records read on standard input', async () => {
    expect(run(['record', '--run', 'r'], JSON.stringify({ kind: 'note', text: 'Hi' }))).toMatchObject({
      ok: true,
      appended: 1,
    });
    const ledger = await readFile(path.join(scratch, 'local', 'ticket-triage', 'ledger.jsonl'), 'utf8');
    expect(ledger).toContain('"kind":"note"');
  });

  it('reports an invalid invocation as a structured failure at exit 0', () => {
    expect(run(['digest', '--run', 'r', '--page-size', '5'])).toMatchObject({ ok: false, error: 'invalid-args' });
  });

  /** Runs the bundle in the scratch repository and parses its stdout. */
  function run(args: readonly string[], stdin = ''): unknown {
    return JSON.parse(execFileSync('node', [BUNDLE, ...args], { cwd: scratch, encoding: 'utf8', input: stdin }));
  }
});
