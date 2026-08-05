import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, assert, describe, expect, it } from 'vitest';

import { readAppendedLines, type TailResult } from '../jsonl-tail.ts';

const tempDirs: string[] = [];

afterEach(() => {
  const pending = [...tempDirs];
  tempDirs.length = 0;
  for (const dir of pending) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('readAppendedLines', () => {
  it('returns all complete lines from offset 0', () => {
    const filePath = composeFile('{"a":1}\n{"b":2}\n');

    const result = expectAppended(readAppendedLines({ filePath, offset: 0 }));

    expect(result.lines).toEqual(['{"a":1}', '{"b":2}']);
    expect(result.offset).toBe(16);
  });

  it('returns only lines past the given offset', () => {
    const filePath = composeFile('{"a":1}\n');
    const first = expectAppended(readAppendedLines({ filePath, offset: 0 }));
    appendFileSync(filePath, '{"b":2}\n');

    const second = expectAppended(readAppendedLines({ filePath, offset: first.offset }));

    expect(second.lines).toEqual(['{"b":2}']);
  });

  it('leaves a torn trailing line unconsumed until its newline arrives', () => {
    const filePath = composeFile('{"a":1}\n{"torn"');

    const first = expectAppended(readAppendedLines({ filePath, offset: 0 }));
    expect(first.lines).toEqual(['{"a":1}']);
    expect(first.offset).toBe(8);

    appendFileSync(filePath, ':2}\n');
    const second = expectAppended(readAppendedLines({ filePath, offset: first.offset }));
    expect(second.lines).toEqual(['{"torn":2}']);
  });

  it('when no newline has arrived at all, returns no lines and keeps the offset', () => {
    const filePath = composeFile('{"torn"');

    const result = expectAppended(readAppendedLines({ filePath, offset: 0 }));

    expect(result.lines).toEqual([]);
    expect(result.offset).toBe(0);
  });

  it('skips blank lines', () => {
    const filePath = composeFile('{"a":1}\n\n  \n{"b":2}\n');

    expect(expectAppended(readAppendedLines({ filePath, offset: 0 })).lines).toEqual(['{"a":1}', '{"b":2}']);
  });

  it('advances the offset by bytes, not characters, for multi-byte UTF-8', () => {
    const line = '{"note":"héllo"}';
    const filePath = composeFile(`${line}\n`);

    const result = expectAppended(readAppendedLines({ filePath, offset: 0 }));

    expect(result.offset).toBe(Buffer.byteLength(`${line}\n`));
  });

  it('reports truncation when the file shrank below the offset', () => {
    const filePath = composeFile('{"a":1}\n');

    expect(readAppendedLines({ filePath, offset: 100 })).toEqual({ kind: 'truncated', size: 8 });
  });

  it('reports a vanished file instead of throwing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'jsonl-tail-'));
    tempDirs.push(dir);

    expect(readAppendedLines({ filePath: join(dir, 'gone.jsonl'), offset: 0 })).toEqual({ kind: 'missing' });
  });
});

// region | Helpers

/** Writes `content` to a fresh temp file and returns its path. */
function composeFile(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'jsonl-tail-'));
  tempDirs.push(dir);
  const filePath = join(dir, 'session.jsonl');
  writeFileSync(filePath, content);
  return filePath;
}

/** Narrows a result to the `appended` variant. */
function expectAppended(result: TailResult): { lines: string[]; offset: number } {
  assert(result.kind === 'appended', `Expected an appended result, got ${result.kind}`);
  return result;
}

// endregion | Helpers
