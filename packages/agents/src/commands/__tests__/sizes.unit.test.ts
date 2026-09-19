import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { appendSnapshot } from '../../deployed-sizes/append-snapshot.ts';
import { resolveRecordPath } from '../../deployed-sizes/resolve-record-path.ts';
import { SNAPSHOT_SCHEMA_VERSION } from '../../deployed-sizes/schema.ts';
import type { DeployedFile, SizeSnapshot } from '../../deployed-sizes/types.ts';
import { renderSizesReport, sizesCommand } from '../sizes.ts';

describe(renderSizesReport, () => {
  it('ranks documents by descending size', () => {
    const report = renderText(
      buildSnapshot({
        'claude/skills/small/SKILL.md': { bytes: 1_024, kind: 'document' },
        'claude/skills/large/SKILL.md': { bytes: 8_192, kind: 'document' },
        'claude/skills/medium/SKILL.md': { bytes: 4_096, kind: 'document' },
      }),
    );

    expect(rankedKeys(report)).toEqual([
      'claude/skills/large/SKILL.md',
      'claude/skills/medium/SKILL.md',
      'claude/skills/small/SKILL.md',
    ]);
  });

  it('orders two documents of one size by key, so that the ranking is stable', () => {
    const report = renderText(
      buildSnapshot({
        'claude/skills/beta/SKILL.md': { bytes: 1_024, kind: 'document' },
        'claude/skills/alpha/SKILL.md': { bytes: 1_024, kind: 'document' },
      }),
    );

    expect(rankedKeys(report)).toEqual(['claude/skills/alpha/SKILL.md', 'claude/skills/beta/SKILL.md']);
  });

  it('excludes assets from the ranking and reports them as the asset total alone', () => {
    const snapshot = {
      ...buildSnapshot({
        'claude/skills/plan/SKILL.md': { bytes: 1_024, kind: 'document' },
        'claude/skills/plan/run.mjs': { bytes: 600_000, kind: 'asset' },
      }),
      aggregates: aggregates({ assets: 600_000 }),
    };

    const report = renderText(snapshot);

    expect(rankedKeys(report)).toEqual(['claude/skills/plan/SKILL.md']);
    expect(report).toContain('Assets:         585.9 KiB');
  });

  it('reports the three aggregates beneath the ranking', () => {
    const snapshot = {
      ...buildSnapshot({ 'claude/skills/plan/SKILL.md': { bytes: 2_048, kind: 'document' } }),
      aggregates: aggregates({
        alwaysLoaded: { total: 3_072, ambientRegions: 1_024, skillDescriptions: 1_536, subagentDescriptions: 512 },
        onInvocation: 2_048,
      }),
    };

    const report = renderText(snapshot);

    expect(report).toContain('Always loaded:  3.0 KiB');
    expect(report).toContain('ambient regions:       1.0 KiB');
    expect(report).toContain('skill descriptions:    1.5 KiB');
    expect(report).toContain('subagent descriptions: 512 B');
    expect(report).toContain('On invocation:  2.0 KiB across 1 document(s)');
  });

  it('renders a sub-kibibyte total in bytes, so that it is distinguishable from nothing', () => {
    const snapshot = {
      ...buildSnapshot({ 'a.md': { bytes: 45, kind: 'document' } }),
      aggregates: aggregates({
        alwaysLoaded: { total: 45, ambientRegions: 0, skillDescriptions: 45, subagentDescriptions: 0 },
      }),
    };

    expect(renderText(snapshot)).toContain('skill descriptions:    45 B');
  });

  it('states that the aggregates overlap rather than partition', () => {
    const report = renderText(buildSnapshot({ 'a.md': { bytes: 1_024, kind: 'document' } }));

    expect(report).toContain('do not sum to a whole');
  });

  it('names the repo sync for an absent record', () => {
    expect(renderText(undefined, false)).toContain('Run `codeassembly sync` to record one.');
  });

  it('names the global sync for an absent record under --global', () => {
    expect(renderText(undefined, true)).toContain('Run `codeassembly sync --global` to record one.');
  });
});

describe(sizesCommand, () => {
  let homeDir: string;
  let info: { text: () => string };

  beforeEach(async () => {
    homeDir = await mkdtemp(path.join(tmpdir(), 'sizes-command-'));
    info = spyOnInfo();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(homeDir, { recursive: true, force: true });
  });

  it('reads the home record under --global whatever the working directory', async () => {
    await appendSnapshot(
      resolveRecordPath({ home: homeDir, domain: 'home' }),
      buildSnapshot({ 'claude/skills/home-only/SKILL.md': { bytes: 1_024, kind: 'document' } }),
    );

    await sizesCommand({ global: true }, process.cwd(), homeDir);

    expect(info.text()).toContain('claude/skills/home-only/SKILL.md');
  });

  it('prints guidance rather than failing when no deployment has been recorded', async () => {
    await expect(sizesCommand({ global: true }, process.cwd(), homeDir)).resolves.toBeUndefined();

    expect(info.text()).toContain('No deployment has been recorded here.');
  });
});

// region | Helpers

/** Aggregates stating zero throughout, overridden per assertion. */
function aggregates(overrides: Partial<SizeSnapshot['aggregates']> = {}): SizeSnapshot['aggregates'] {
  return {
    alwaysLoaded: { total: 0, ambientRegions: 0, skillDescriptions: 0, subagentDescriptions: 0 },
    onInvocation: 0,
    assets: 0,
    ...overrides,
  };
}

/** A snapshot stating `files` as its size vector. */
function buildSnapshot(files: Record<string, DeployedFile>): SizeSnapshot {
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    kind: 'snapshot',
    recordedAt: '2026-09-19T08:00:00.000Z',
    version: '0.15.0',
    files,
    aggregates: aggregates(),
  };
}

/** The document keys in the order that the ranking lists them: one line per document, size then key. */
function rankedKeys(report: string): ReadonlyArray<string> {
  return report
    .split('\n')
    .map((line) => /^ {2}\s*[\d.]+ (?:B|KiB) {2}(?<key>\S+)$/.exec(line)?.groups?.key)
    .filter((key) => key !== undefined);
}

/** The report rendered as the text that a reader sees. */
function renderText(snapshot: SizeSnapshot | undefined, global = false): string {
  return renderSizesReport(snapshot, global)
    .map((line) => line.text)
    .join('\n');
}

/** Captures what the command writes to the info stream. */
function spyOnInfo(): { text: () => string } {
  const spy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
  return { text: () => spy.mock.calls.map((call) => String(call[0])).join('\n') };
}

// endregion | Helpers
