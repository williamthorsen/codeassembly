import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { InstallOptions } from '../../lib/types.ts';
import { initGlobalCommand } from '../init.ts';
import { syncGlobalCommand } from '../sync.ts';

// Runs `init --global` then `sync --global` against the real content library to catch failures that
// only show up with real content.
describe('sync --global (real library, all collection)', () => {
  let homeDir: string;

  beforeEach(async () => {
    homeDir = path.join(tmpdir(), `agents-test-sync-global-int-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(homeDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(homeDir, { recursive: true, force: true });
  });

  function makeOptions(overrides: Partial<InstallOptions> = {}): InstallOptions {
    return { harness: 'claude', link: false, force: false, dryRun: false, ...overrides };
  }

  it('init --global then sync --global deploys the whole catalog with transforms applied', async () => {
    await initGlobalCommand(makeOptions(), homeDir);
    expect(await readFile(path.join(homeDir, '.agents', 'codeassembly.yaml'), 'utf8')).toContain('- all');

    // A throw here means the real catalog failed to resolve, transform, or write end-to-end.
    await syncGlobalCommand(makeOptions(), homeDir);

    const skillsDir = path.join(homeDir, '.claude', 'skills');
    const deployedSkills = await readdir(skillsDir);
    // A representative sample of the real skill catalog landed, sync-owned.
    expect(deployedSkills).toContain('commit');
    expect(deployedSkills).toContain('create-pr');
    const commit = await readFile(path.join(skillsDir, 'commit', 'SKILL.md'), 'utf8');
    expect(commit).toContain('<!-- codeassembly-skill:commit -->');

    // Transforms ran across the real catalog. The three ticket-emitting skills share the ticket-authoring
    // partials, so each must deploy with every include directive expanded; design-and-plan additionally
    // exercises `{tool:…}` placeholder rewriting.
    for (const emitter of ['create-ticket', 'design-and-plan', 'align-ticket-with-implementation']) {
      const deployed = await readFile(path.join(skillsDir, emitter, 'SKILL.md'), 'utf8');
      expect(deployed, `${emitter} deployed with an unexpanded include directive`).not.toContain('<!-- include:');
    }
    const designAndPlan = await readFile(path.join(skillsDir, 'design-and-plan', 'SKILL.md'), 'utf8');
    expect(designAndPlan).not.toContain('{tool:');

    // Subagents and rulebooks reach the home domain through `@library` too.
    expect((await readdir(path.join(homeDir, '.claude', 'agents'))).length).toBeGreaterThan(0);
    expect(existsSync(path.join(skillsDir, 'consult-shell-conventions', 'SKILL.md'))).toBe(true);
  });
});
