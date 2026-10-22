import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** Writes `records` as the fixture's ledger. */
export function writeLedger(root: string, records: ReadonlyArray<Record<string, unknown>>): void {
  const dir = path.join(root, 'local', 'ticket-triage');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'ledger.jsonl'), records.map((record) => `${JSON.stringify(record)}\n`).join(''));
}
