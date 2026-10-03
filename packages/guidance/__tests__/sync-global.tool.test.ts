import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const PACKAGE_ROOT = path.resolve(import.meta.dirname, '..');
const CONTENT_DIR = path.join(PACKAGE_ROOT, 'content');
const CODEASSEMBLY_BIN = path.join(PACKAGE_ROOT, 'node_modules', '.bin', 'codeassembly');

// Runs `init --global` then `sync --global` through the CLI against the library, to catch failures that only real
// content produces. Deploying the whole catalog runs long under parallel-worker load.
describe('sync --global (library, seeded collections)', { timeout: 60_000 }, () => {
  let homeDir: string;

  beforeEach(async () => {
    homeDir = await mkdtemp(path.join(tmpdir(), 'guidance-sync-global-'));
  });

  afterEach(async () => {
    await rm(homeDir, { recursive: true, force: true });
  });

  it('deploys the seeded collections with transforms applied', async () => {
    runCodeassembly(homeDir, ['init', '--global']);
    // The machine-local tier names the library as the home domain's source, leaving the seeded declaration as
    // `init --global` wrote it.
    await writeFile(
      path.join(homeDir, '.agents', 'codeassembly.local.yaml'),
      `sources:\n  - name: codeassembly-guidance\n    path: ${CONTENT_DIR}\n`,
      'utf8',
    );

    runCodeassembly(homeDir, ['sync', '--global', '--harness', 'claude']);

    const skillsDir = path.join(homeDir, '.claude', 'skills');
    const deployedSkills = await readdir(skillsDir);
    expect(deployedSkills).toContain('create-commit');
    expect(deployedSkills).toContain('create-pr');
    const createCommit = await readFile(path.join(skillsDir, 'create-commit', 'SKILL.md'), 'utf8');
    expect(createCommit).toContain('<!-- codeassembly-skill:create-commit -->');

    // The three ticket-emitting skills share the ticket-authoring partials, so each must deploy with every include
    // directive expanded; design-and-plan also exercises `{tool:…}` placeholder rewriting.
    for (const emitter of ['create-ticket', 'design-and-plan', 'align-ticket-with-implementation']) {
      const deployed = await readFile(path.join(skillsDir, emitter, 'SKILL.md'), 'utf8');
      expect(deployed, `${emitter} deployed with an unexpanded include directive`).not.toContain('<!-- include:');
    }
    const designAndPlan = await readFile(path.join(skillsDir, 'design-and-plan', 'SKILL.md'), 'utf8');
    expect(designAndPlan).not.toContain('{tool:');

    // Each subagent resolves from the library source, so each is merged against the library's own overlay.
    const agentsDir = path.join(homeDir, '.claude', 'agents');
    const deployedSubagents = await readdir(agentsDir);
    expect(deployedSubagents.length).toBeGreaterThan(0);
    for (const fileName of deployedSubagents) {
      const deployed = await readFile(path.join(agentsDir, fileName), 'utf8');
      expect(deployed, `${fileName} deployed without the overlay defaults`).toContain(
        'permissionMode: bypassPermissions',
      );
    }
    expect(existsSync(path.join(skillsDir, 'consult-shell-conventions', 'SKILL.md'))).toBe(true);
    expect(existsSync(path.join(skillsDir, '_sources', 'codeassembly-guidance', '_data', 'concision.md'))).toBe(true);
  });
});

// region | Helpers

/** Runs the `codeassembly` CLI with `homeDir` as the home directory, throwing on a non-zero exit. */
function runCodeassembly(homeDir: string, args: ReadonlyArray<string>): void {
  execFileSync(CODEASSEMBLY_BIN, args, { cwd: homeDir, env: { ...process.env, HOME: homeDir }, stdio: 'pipe' });
}

// endregion | Helpers
