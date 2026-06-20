import { existsSync } from 'node:fs';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { InstallOptions } from '../../lib/types.js';
import { installCommand } from '../install.js';

/**
 * Round-trip tests for the reviewer/coder subagent files that were migrated to use
 * shared partials. These run against the real `content/` tree and verify that the
 * installed output contains the expected expanded content (no leftover include
 * directives and the key prose blocks present).
 */
describe('reviewer and coder partials install correctly', () => {
  let tempDir: string;
  let claudeAgentsDir: string;

  beforeEach(async () => {
    tempDir = path.join(tmpdir(), `agents-test-reviewer-partials-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    claudeAgentsDir = path.join(tempDir, '.claude', 'agents');
    await mkdir(path.join(tempDir, '.claude', 'skills'), { recursive: true });
    await mkdir(claudeAgentsDir, { recursive: true });

    const options: InstallOptions = {
      harness: 'claude',
      link: false,
      force: false,
      dryRun: false,
    };
    await installCommand(options, tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  async function readInstalled(name: string): Promise<string> {
    return readFile(path.join(claudeAgentsDir, `${name}.md`), 'utf8');
  }

  const returnBlockReviewers = [
    'aspect-code-reviewer',
    'aspect-silent-failure-reviewer',
    'aspect-test-reviewer',
    'orchestrated-reviewer',
  ] as const;

  for (const reviewer of returnBlockReviewers) {
    it(`expands all partials in ${reviewer} (no leftover directives)`, async () => {
      const content = await readInstalled(reviewer);
      expect(content).not.toContain('<!-- include:');
      expect(content).not.toContain('<!-- /include -->');
      expect(content).not.toContain('<!-- children -->');
    });

    it(`${reviewer} preserves the HARD-GATE block including the re-review note`, async () => {
      const content = await readInstalled(reviewer);
      expect(content).toContain('your NEXT tool use MUST be a `Write` of the review scaffold');
      expect(content).toContain('The HARD-GATE applies on every dispatch, including re-reviews');
    });

    it(`${reviewer} preserves the scaffold subsection`, async () => {
      const content = await readInstalled(reviewer);
      expect(content).toContain('### Scaffold (first write)');
      expect(content).toContain('### Criticality: (pending)');
      expect(content).toContain('(none yet)');
    });

    it(`${reviewer} preserves the interim writes prose and reviewer-specific example`, async () => {
      const content = await readInstalled(reviewer);
      expect(content).toContain('### Interim writes (after each finding)');
      expect(content).toContain('Example interim form with one finding present');
    });

    it(`${reviewer} preserves the finalize subsection and the "Then emit" sentence`, async () => {
      const content = await readInstalled(reviewer);
      expect(content).toContain('### Finalize (reserved last 3 turns)');
      expect(content).toContain('Then emit your structured return block.');
    });
  }

  it('expands all partials in code-simplification-reviewer', async () => {
    const content = await readInstalled('code-simplification-reviewer');
    expect(content).not.toContain('<!-- include:');
    expect(content).not.toContain('<!-- /include -->');
    expect(content).not.toContain('<!-- children -->');
  });

  it('code-simplification-reviewer omits the re-review note (intentional carve-out)', async () => {
    const content = await readInstalled('code-simplification-reviewer');
    expect(content).toContain('your NEXT tool use MUST be a `Write` of the review scaffold');
    expect(content).not.toContain('The HARD-GATE applies on every dispatch, including re-reviews');
  });

  it('code-simplification-reviewer keeps the "for this phase" prelude addendum', async () => {
    const content = await readInstalled('code-simplification-reviewer');
    expect(content).toContain('primary state-transfer channel for this phase');
    expect(content).toContain('decide whether to dispatch a coder fix cycle');
  });

  it('code-simplification-reviewer omits the "Then emit" sentence (intentional carve-out)', async () => {
    const content = await readInstalled('code-simplification-reviewer');
    expect(content).toContain('### Finalize (reserved last 3 turns)');
    expect(content).not.toContain('Then emit your structured return block.');
  });

  it('orchestrated-coder expands all four coder partials', async () => {
    const content = await readInstalled('orchestrated-coder');
    expect(content).not.toContain('<!-- include:');
    expect(content).not.toContain('<!-- /include -->');
    expect(content).not.toContain('<!-- children -->');
    // Key landmarks from each of the four coder partials
    expect(content).toContain('Single-task implementation plans are exempt');
    expect(content).toContain("The change-summary is the orchestrator's primary state-transfer channel");
    expect(content).toContain('### Implementation-mode scaffold');
    expect(content).toContain('### Review-response-mode scaffold');
  });

  const allReviewers = [...returnBlockReviewers, 'code-simplification-reviewer'] as const;

  for (const reviewer of allReviewers) {
    it(`${reviewer} includes the actionability-gate findings bullet`, async () => {
      const content = await readInstalled(reviewer);
      expect(content).toContain('**No self-disqualifying findings**');
    });
  }

  it('does not install the subagents _partials directory', () => {
    expect(existsSync(path.join(claudeAgentsDir, '_partials'))).toBe(false);
  });
});
