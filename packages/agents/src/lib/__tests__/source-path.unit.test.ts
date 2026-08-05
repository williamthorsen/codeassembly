import { homedir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveSourcePath } from '../source-path.ts';

describe(resolveSourcePath, () => {
  const fileDir = '/repo/.agents';

  it('resolves a relative path against the declaring file’s directory', () => {
    expect(resolveSourcePath('../shared', fileDir)).toBe('/repo/shared');
  });

  it('resolves a dot-relative path against the declaring file’s directory', () => {
    expect(resolveSourcePath('./guidance', fileDir)).toBe('/repo/.agents/guidance');
  });

  it('returns an absolute path unchanged', () => {
    expect(resolveSourcePath('/opt/guidance', fileDir)).toBe('/opt/guidance');
  });

  it('expands a lone ~ to the home directory', () => {
    expect(resolveSourcePath('~', fileDir)).toBe(homedir());
  });

  it('expands a ~/ prefix against the home directory', () => {
    expect(resolveSourcePath('~/guidance', fileDir)).toBe(path.join(homedir(), 'guidance'));
  });
});
