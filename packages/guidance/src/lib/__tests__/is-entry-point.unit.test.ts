import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { isEntryPoint } from '../is-entry-point.ts';

describe(isEntryPoint, () => {
  let dir: string;
  let modulePath: string;
  let moduleUrl: string;
  let originalArgv: string[];

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'is-entry-point-'));
    modulePath = path.join(dir, 'cli.mjs');
    writeFileSync(modulePath, '');
    moduleUrl = pathToFileURL(modulePath).href;
    originalArgv = process.argv;
  });

  afterEach(() => {
    process.argv = originalArgv;
    vi.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns false when the process has no entry path', () => {
    setEntry(undefined);

    expect(isEntryPoint(moduleUrl, 'probe')).toBe(false);
  });

  it('returns true when the entry path is the module', () => {
    setEntry(modulePath);

    expect(isEntryPoint(moduleUrl, 'probe')).toBe(true);
  });

  it('returns true when the entry path is a symlink to the module', () => {
    const linkPath = path.join(dir, 'link.mjs');
    symlinkSync(modulePath, linkPath);
    setEntry(linkPath);

    expect(isEntryPoint(moduleUrl, 'probe')).toBe(true);
  });

  it('returns false when the entry path is another file', () => {
    const otherPath = path.join(dir, 'other.mjs');
    writeFileSync(otherPath, '');
    setEntry(otherPath);

    expect(isEntryPoint(moduleUrl, 'probe')).toBe(false);
  });

  it('warns with the program name and returns true when the entry path does not resolve', () => {
    const write = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    setEntry(path.join(dir, 'missing.mjs'));

    expect(isEntryPoint(moduleUrl, 'probe')).toBe(true);
    expect(write).toHaveBeenCalledWith(expect.stringMatching(/^probe: warning: could not determine entry point: /));
  });
});

// region | Helpers

/** Replaces `process.argv` with one whose entry path is `entry`. */
function setEntry(entry: string | undefined): void {
  process.argv = entry === undefined ? ['node'] : ['node', entry];
}

// endregion | Helpers
