import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { DeployedPath, DeployedPathSet } from '../../commands/sync/collect-deployed-paths.ts';
import { AMBIENT_CLOSE_MARKER, AMBIENT_OPEN_MARKER } from '../../lib/ambient-region.ts';
import { measureDeployment } from '../measure-deployment.ts';

describe(measureDeployment, () => {
  let baseDir: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(path.join(tmpdir(), 'measure-deployment-'));
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  it('records each measured file under its key, with its bytes and its kind', async () => {
    const body = await writeDeployed('skills/plan/SKILL.md', 'a'.repeat(40));
    const asset = await writeDeployed('skills/plan/run.mjs', 'b'.repeat(15));

    const measured = await measureDeployment({
      files: [
        file(body, 'claude/skills/plan/SKILL.md', 'document'),
        file(asset, 'claude/skills/plan/run.mjs', 'asset'),
      ],
      ambientHostPaths: [],
    });

    expect(measured.files).toEqual({
      'claude/skills/plan/SKILL.md': { bytes: 40, kind: 'document' },
      'claude/skills/plan/run.mjs': { bytes: 15, kind: 'asset' },
    });
  });

  it('totals documents and assets separately', async () => {
    const body = await writeDeployed('skills/plan/SKILL.md', 'a'.repeat(40));
    const asset = await writeDeployed('skills/plan/run.mjs', 'b'.repeat(15));

    const measured = await measureDeployment({
      files: [file(body, 'a.md', 'document'), file(asset, 'b.mjs', 'asset')],
      ambientHostPaths: [],
    });

    expect(measured.aggregates.onInvocation).toBe(40);
    expect(measured.aggregates.assets).toBe(15);
  });

  it('names the three always-loaded components separately and sums them into the total', async () => {
    const skill = await writeDeployed('skills/plan/SKILL.md', frontmatter('plan', 'Plans the work'));
    const subagent = await writeDeployed('agents/reviser.md', frontmatter('reviser', 'Revises prose'));
    const host = await writeDeployed('CLAUDE.md', withAmbientRegion('ambient guidance'));

    const measured = await measureDeployment({
      files: [
        { ...file(skill, 'claude/skills/plan/SKILL.md', 'document'), role: 'skill' },
        { ...file(subagent, 'claude/agents/reviser.md', 'document'), role: 'subagent' },
      ],
      ambientHostPaths: [host],
    });

    expect(measured.aggregates.alwaysLoaded).toEqual({
      total: 'ambient guidance'.length + 'Plans the work'.length + 'Revises prose'.length,
      ambientRegions: 'ambient guidance'.length,
      skillDescriptions: 'Plans the work'.length,
      subagentDescriptions: 'Revises prose'.length,
    });
  });

  it('counts a description in the always-loaded total and again inside its document bytes', async () => {
    const content = frontmatter('plan', 'Plans the work');
    const skill = await writeDeployed('skills/plan/SKILL.md', content);

    const measured = await measureDeployment({
      files: [{ ...file(skill, 'claude/skills/plan/SKILL.md', 'document'), role: 'skill' }],
      ambientHostPaths: [],
    });

    expect(measured.aggregates.onInvocation).toBe(Buffer.byteLength(content, 'utf8'));
    expect(measured.aggregates.alwaysLoaded.skillDescriptions).toBe('Plans the work'.length);
  });

  it('counts a description in bytes rather than in characters', async () => {
    const skill = await writeDeployed('skills/plan/SKILL.md', frontmatter('plan', 'Rèsumè'));

    const measured = await measureDeployment({
      files: [{ ...file(skill, 'claude/skills/plan/SKILL.md', 'document'), role: 'skill' }],
      ambientHostPaths: [],
    });

    expect(measured.aggregates.alwaysLoaded.skillDescriptions).toBe(8);
  });

  it('counts a deployed subagent description for a harness whose overlay rewrote its other keys', async () => {
    const claude = await writeDeployed('agents/reviser.md', frontmatter('reviser', 'Revises prose', 'tools: [Read]'));
    const rovo = await writeDeployed('subagents/reviser.md', frontmatter('reviser', 'Revises prose', 'tools: [grep]'));

    const measured = await measureDeployment({
      files: [
        { ...file(claude, 'claude/agents/reviser.md', 'document'), role: 'subagent' },
        { ...file(rovo, 'rovo/subagents/reviser.md', 'document'), role: 'subagent' },
      ],
      ambientHostPaths: [],
    });

    expect(measured.aggregates.alwaysLoaded.subagentDescriptions).toBe('Revises prose'.length * 2);
  });

  it('contributes zero for a guidance file with no ambient region', async () => {
    const host = await writeDeployed('CLAUDE.md', '# Hand-authored guidance\n');

    const measured = await measureDeployment({ files: [], ambientHostPaths: [host] });

    expect(measured.aggregates.alwaysLoaded).toEqual({
      total: 0,
      ambientRegions: 0,
      skillDescriptions: 0,
      subagentDescriptions: 0,
    });
  });

  it('contributes zero for a guidance file that the deployment has not created', async () => {
    const measured = await measureDeployment({ files: [], ambientHostPaths: [path.join(baseDir, 'absent.md')] });

    expect(measured.aggregates.alwaysLoaded.ambientRegions).toBe(0);
  });

  it('contributes zero for a deployed skill whose frontmatter declares no description', async () => {
    const skill = await writeDeployed('skills/plan/SKILL.md', '---\nname: plan\n---\n\n# Plan\n');

    const measured = await measureDeployment({
      files: [{ ...file(skill, 'claude/skills/plan/SKILL.md', 'document'), role: 'skill' }],
      ambientHostPaths: [],
    });

    expect(measured.aggregates.alwaysLoaded.skillDescriptions).toBe(0);
  });

  it('skips a collected file that is no longer on disk, keeping the rest of the measurement', async () => {
    const present = await writeDeployed('skills/plan/SKILL.md', 'a'.repeat(40));

    const measured = await measureDeployment({
      files: [
        file(present, 'claude/skills/plan/SKILL.md', 'document'),
        file(path.join(baseDir, 'skills/gone/SKILL.md'), 'claude/skills/gone/SKILL.md', 'document'),
      ],
      ambientHostPaths: [],
    });

    expect(measured.files).toEqual({ 'claude/skills/plan/SKILL.md': { bytes: 40, kind: 'document' } });
    expect(measured.aggregates.onInvocation).toBe(40);
  });

  it('measures an empty deployment as zero throughout', async () => {
    const measured = await measureDeployment(emptySet());

    expect(measured).toEqual({
      files: {},
      expansions: {},
      documentExpansions: {},
      aggregates: {
        alwaysLoaded: { total: 0, ambientRegions: 0, skillDescriptions: 0, subagentDescriptions: 0 },
        onInvocation: 0,
        assets: 0,
      },
    });
  });

  // region | Helpers

  /** Writes a deployed file under the temporary tree and returns its absolute path. */
  async function writeDeployed(relPath: string, content: string): Promise<string> {
    const absPath = path.join(baseDir, relPath);
    await mkdir(path.dirname(absPath), { recursive: true });
    await writeFile(absPath, content, 'utf8');
    return absPath;
  }

  // endregion | Helpers
});

// region | Helpers

/** A measured deployment with nothing in it. */
function emptySet(): DeployedPathSet {
  return { files: [], ambientHostPaths: [] };
}

/** One collected file, in the `other` role that contributes to no description total. */
function file(absPath: string, key: string, kind: 'asset' | 'document'): DeployedPath {
  return { key, absPath, kind, role: 'other', harnessId: 'claude', sourceRoot: undefined, authored: undefined };
}

/** A Markdown file whose frontmatter declares a name, a description, and optionally one harness-rewritten key. */
function frontmatter(name: string, description: string, extra?: string): string {
  const lines = ['---', `name: ${name}`, `description: ${description}`, ...(extra === undefined ? [] : [extra]), '---'];
  return `${lines.join('\n')}\n\n# ${name}\n`;
}

/** A guidance file holding one well-formed ambient region around `body`. */
function withAmbientRegion(body: string): string {
  return `# Guidance\n\n${AMBIENT_OPEN_MARKER}\n${body}\n${AMBIENT_CLOSE_MARKER}\n`;
}

// endregion | Helpers
