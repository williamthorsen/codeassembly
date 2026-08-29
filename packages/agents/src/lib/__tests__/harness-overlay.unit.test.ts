import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { HARNESSES } from '../harness.ts';
import { loadHarnessOverlay } from '../harness-overlay.ts';

const OVERLAY = '_defaults:\n  model: sonnet\n';

describe(loadHarnessOverlay, () => {
  let contentDir: string;

  beforeEach(async () => {
    contentDir = path.join(tmpdir(), `agents-test-overlay-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(path.join(contentDir, 'subagents', '_data'), { recursive: true });
  });

  afterEach(async () => {
    await rm(contentDir, { recursive: true, force: true });
  });

  it('reads the harness overlay file from subagents/_data', async () => {
    await writeFile(path.join(contentDir, 'subagents', '_data', 'claude.yaml'), OVERLAY, 'utf8');

    expect(await loadHarnessOverlay(contentDir, HARNESSES.claude)).toBe(OVERLAY);
  });

  it('returns an empty string when the overlay file is absent', async () => {
    expect(await loadHarnessOverlay(contentDir, HARNESSES.rovo)).toBe('');
  });
});
