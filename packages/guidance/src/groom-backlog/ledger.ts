/**
 * The sweep's ledger: an append-only JSONL file in the primary worktree's `local/ticket-triage/`, shared by every
 * worktree of the repository, beside one directory of assessor replies per run.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { type LedgerRecord, LedgerRecordSchema } from './schemas.ts';
import type { CommandRunner } from './types.ts';

/** The ledger's directory, relative to the primary worktree. */
export const LEDGER_DIR = path.join('local', 'ticket-triage');

/** The ledger's paths for one repository. */
export interface LedgerPaths {
  /** The directory that holds one subdirectory of reply files per run. */
  assessmentsDir: string;
  ledgerFile: string;
}

/** A ledger line that does not parse as a record. */
export interface LedgerDefect {
  line: number;
  message: string;
}

/** Appends `records` to the ledger, creating its directory on the first append. */
export function appendRecords(ledgerFile: string, records: readonly LedgerRecord[]): void {
  if (records.length === 0) return;
  mkdirSync(path.dirname(ledgerFile), { recursive: true });
  appendFileSync(ledgerFile, records.map((record) => `${JSON.stringify(record)}\n`).join(''), 'utf8');
}

/** Returns the path of the reply file for one ticket in one run. */
export function buildReplyPath(paths: LedgerPaths, run: string, number: number): string {
  return path.join(paths.assessmentsDir, run, `${number}.json`);
}

/**
 * Parses the ledger's lines. A blank line is skipped, and a line that does not parse is reported rather than thrown,
 * so that one damaged line does not hide the rest of the history.
 */
export function parseLedger(text: string): { defects: LedgerDefect[]; records: LedgerRecord[] } {
  const records: LedgerRecord[] = [];
  const defects: LedgerDefect[] = [];
  for (const [index, line] of text.split('\n').entries()) {
    if (line.trim() === '') continue;
    try {
      const parsed = LedgerRecordSchema.safeParse(JSON.parse(line));
      if (parsed.success) {
        records.push(parsed.data);
      } else {
        defects.push({ line: index + 1, message: parsed.error.issues.map((issue) => issue.message).join('; ') });
      }
    } catch (error) {
      defects.push({ line: index + 1, message: error instanceof Error ? error.message : String(error) });
    }
  }
  return { defects, records };
}

/** Reads and parses the ledger; a ledger that does not exist yet reads as empty. */
export function readLedger(ledgerFile: string): { defects: LedgerDefect[]; records: LedgerRecord[] } {
  if (!existsSync(ledgerFile)) return { defects: [], records: [] };
  return parseLedger(readFileSync(ledgerFile, 'utf8'));
}

/**
 * Resolves the ledger's paths from any worktree of the repository at `root`: The git common directory belongs to the
 * primary worktree, whose root is its parent.
 */
export async function resolveLedgerPaths(run: CommandRunner, root: string): Promise<LedgerPaths> {
  const commonDir = path.resolve(root, (await run('git', ['rev-parse', '--git-common-dir'], root)).trim());
  const base = path.join(path.dirname(commonDir), LEDGER_DIR);
  return { assessmentsDir: path.join(base, 'assessments'), ledgerFile: path.join(base, 'ledger.jsonl') };
}
