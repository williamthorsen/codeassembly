/* eslint n/no-process-exit: off */
/* eslint unicorn/no-process-exit: off */
// CLI entry point for the update-jira-ticket pre-flight checker.
//
// Reads the HTML payload from stdin, runs `check()`, and writes the discriminated-union result to stdout as
// pretty-printed JSON. Exit 0 for both `ok: true` and `ok: false` (recoverable findings are not system errors);
// exit 1 only when the invocation itself is wrong (unreadable stdin).

import process from 'node:process';
import type { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

import { check } from './check.ts';

/** Read every chunk of `stream` and concatenate into a single UTF-8 string. */
async function readAll(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    if (!Buffer.isBuffer(chunk)) {
      throw new TypeError('readAll: expected Buffer chunks (stream must be in binary mode)');
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** Top-level entry: read stdin, run the check, emit JSON. */
async function main(): Promise<void> {
  try {
    const html = await readAll(process.stdin);
    const result = check(html);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`update-jira-ticket: ${message}\n`);
    process.exit(1);
  }
}

// Run as a CLI when invoked directly; stay importable for tests.
if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
