import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { isRecord } from '../../lib/type-guards.ts';
import type { AppliedFix } from '../types.ts';

/** Milliseconds to wait for the `kb-edit` subprocess before killing it and failing the fix. */
const KB_EDIT_TIMEOUT_MS = 30_000;

/** Outcome of invoking the kb-edit subprocess. */
export type RetagOutcome = { ok: true } | { ok: false; message: string };

/**
 * Invokes `node` over the given argv to completion. The argv is the kb-edit invocation in next-argv form:
 * `[kbEditPath, notePath, '--retag', '<comma-joined-tags>']`.
 */
export type RetagRunner = (args: readonly string[]) => Promise<RetagOutcome>;

/**
 * Canonicalizes the tags of one note by delegating to the sibling `kb-edit` helper as a subprocess, honoring
 * "one writer of frontmatter" literally — only the `kb-edit` process mutates frontmatter.
 *
 * The note's **current** tag list is passed to `kb-edit --retag` as a single comma-joined argv element (next-argv
 * form, not inline `--retag=value`); `kb-edit` rewrites each tag through the KB's alias map. `kb-edit.mjs` is
 * resolved as a sibling of the bundled `kb-curate.mjs` via `import.meta.url`; when it is absent (skills deployed
 * without co-location), the fix fails with a clear message and does not abort the run. A non-zero exit or
 * `{ ok: false }` from `kb-edit` likewise yields `ok: false` for this fix. `run` is injectable for tests.
 */
export async function canonicalizeTags(input: {
  notePath: string;
  currentTags: readonly string[];
  kbEditPath?: string | null;
  run?: RetagRunner;
}): Promise<AppliedFix> {
  const { notePath, currentTags } = input;
  const kbEditPath = input.kbEditPath === undefined ? resolveKbEditPath() : input.kbEditPath;
  if (kbEditPath === null) {
    return {
      path: notePath,
      rule: 'frontmatter.tag-alias',
      ok: false,
      operation: 'kb-edit --retag',
      message: 'sibling kb-edit.mjs not found; tag canonicalization requires kb-edit to be co-located',
    };
  }

  const args = [kbEditPath, notePath, '--retag', currentTags.join(',')];
  const run = input.run ?? runNode;
  const outcome = await run(args);
  if (!outcome.ok) {
    return {
      path: notePath,
      rule: 'frontmatter.tag-alias',
      ok: false,
      operation: 'kb-edit --retag',
      message: outcome.message,
    };
  }
  return { path: notePath, rule: 'frontmatter.tag-alias', ok: true, operation: 'kb-edit --retag' };
}

// region | Helpers

/** Resolves the sibling `kb-edit.mjs` next to the running `kb-curate.mjs`; `null` when it does not exist. */
function resolveKbEditPath(): string | null {
  const selfDir = dirname(fileURLToPath(import.meta.url));
  // When bundled, kb-edit.mjs is installed as a sibling skill directory's entry.
  const candidate = join(selfDir, '..', 'kb-edit', 'kb-edit.mjs');
  return existsSync(candidate) ? candidate : null;
}

/**
 * Runs `node <args>` to completion, parsing the JSON stdout and treating `{ ok: false }` or a non-zero exit as
 * failure. A child that does not exit within {@link KB_EDIT_TIMEOUT_MS} is killed and the fix fails, so a hung
 * `kb-edit` cannot stall the whole `--apply` run.
 */
const runNode: RetagRunner = (args) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, [...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let settled = false;
    function settle(outcome: RetagOutcome): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(outcome);
    }
    const timer = setTimeout(() => {
      child.kill();
      settle({ ok: false, message: `kb-edit timed out after ${KB_EDIT_TIMEOUT_MS}ms` });
    }, KB_EDIT_TIMEOUT_MS);
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (error) => {
      settle({ ok: false, message: `failed to spawn kb-edit: ${error.message}` });
    });
    child.on('close', (code) => {
      if (code !== 0) {
        settle({ ok: false, message: `kb-edit exited ${code ?? 'null'}: ${stderr.trim()}` });
        return;
      }
      try {
        const parsed: unknown = JSON.parse(stdout);
        if (isRecord(parsed) && parsed.ok === true) {
          settle({ ok: true });
          return;
        }
        const message =
          isRecord(parsed) && typeof parsed.message === 'string' ? parsed.message : 'kb-edit reported a non-ok result';
        settle({ ok: false, message });
      } catch {
        settle({ ok: false, message: `could not parse kb-edit output: ${stdout.trim()}` });
      }
    });
  });

// endregion | Helpers
