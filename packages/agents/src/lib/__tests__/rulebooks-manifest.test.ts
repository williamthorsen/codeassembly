import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readRulebooksManifest } from '../rulebooks-manifest.ts';

describe(readRulebooksManifest, () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = path.join(tmpdir(), `agents-test-manifest-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(projectRoot, { recursive: true });
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  /** Writes `.agents/rulebooks.yaml` under the temp project root. */
  async function writeManifest(content: string): Promise<void> {
    const agentsDir = path.join(projectRoot, '.agents');
    await mkdir(agentsDir, { recursive: true });
    await writeFile(path.join(agentsDir, 'rulebooks.yaml'), content, 'utf8');
  }

  it('when the manifest file is absent, returns undefined', async () => {
    expect(await readRulebooksManifest(projectRoot)).toBeUndefined();
  });

  it('when the file is present but empty, returns an empty array', async () => {
    await writeManifest('');
    expect(await readRulebooksManifest(projectRoot)).toEqual([]);
  });

  it('when the rulebooks list is empty, returns an empty array', async () => {
    await writeManifest('rulebooks: []\n');
    expect(await readRulebooksManifest(projectRoot)).toEqual([]);
  });

  it('reads shorthand string entries', async () => {
    await writeManifest('rulebooks:\n  - shell-conventions\n  - typescript\n');
    expect(await readRulebooksManifest(projectRoot)).toEqual(['shell-conventions', 'typescript']);
  });

  it('reads structured entries via the name key', async () => {
    await writeManifest('rulebooks:\n  - name: shell-conventions\n');
    expect(await readRulebooksManifest(projectRoot)).toEqual(['shell-conventions']);
  });

  it('tolerates unknown keys on structured entries', async () => {
    await writeManifest('rulebooks:\n  - name: shell-conventions\n    source: npm\n    note: future\n');
    expect(await readRulebooksManifest(projectRoot)).toEqual(['shell-conventions']);
  });

  it('deduplicates repeated slugs, preserving first occurrence', async () => {
    await writeManifest('rulebooks:\n  - alpha\n  - beta\n  - alpha\n');
    expect(await readRulebooksManifest(projectRoot)).toEqual(['alpha', 'beta']);
  });

  it('throws when an entry is neither a string nor has a name', async () => {
    await writeManifest('rulebooks:\n  - 42\n');
    await expect(readRulebooksManifest(projectRoot)).rejects.toThrow(/entry/i);
  });

  it('throws when rulebooks is not a list', async () => {
    await writeManifest('rulebooks: not-a-list\n');
    await expect(readRulebooksManifest(projectRoot)).rejects.toThrow(/list/i);
  });

  it('when the file is comment-only, returns an empty array', async () => {
    await writeManifest('# just a comment, no declarations yet\n');
    expect(await readRulebooksManifest(projectRoot)).toEqual([]);
  });

  it('throws when the top level is a bare list instead of a rulebooks mapping', async () => {
    await writeManifest('- shell-conventions\n- typescript\n');
    await expect(readRulebooksManifest(projectRoot)).rejects.toThrow(/mapping|rulebooks/i);
  });
});
