import { join } from 'node:path';

import type { Mock } from 'vitest';
import { describe, expect, it, vi } from 'vitest';

import type { ProcessRunner } from '../recall.ts';
import { parseRipgrepOutput, recallNotes } from '../recall.ts';
import type { ScopedKb } from '../types.ts';

const NOTES_VAULT = join(import.meta.dirname, 'fixtures', 'notes-vault');

const notesVaultScope: ScopedKb[] = [{ name: 'notes', path: NOTES_VAULT, via: 'discovery' }];

describe(recallNotes, () => {
  it('invokes ripgrep with the markdown glob, the .kb exclusion, the context window, and the JSON format', async () => {
    const runner = vi.fn<ProcessRunner>().mockResolvedValue({ stdout: '' });

    await recallNotes({ query: 'backpressure', scopedKbs: notesVaultScope, runner });

    expect(runner).toHaveBeenCalledWith('rg', [
      '--ignore-case',
      '--glob',
      '*.md',
      '--glob',
      '!.kb/**',
      '--context',
      '1',
      '--json',
      'backpressure',
      NOTES_VAULT,
    ]);
  });

  it('escapes regex metacharacters so a query term matches literally', async () => {
    const runner = vi.fn<ProcessRunner>().mockResolvedValue({ stdout: '' });

    await recallNotes({ query: 'c++', scopedKbs: notesVaultScope, runner });

    expect(readPattern(runner)).toBe(String.raw`c\+\+`);
  });

  it('combines query terms disjunctively in a single pattern', async () => {
    const runner = vi.fn<ProcessRunner>().mockResolvedValue({ stdout: '' });

    await recallNotes({ query: 'backpressure dependency', scopedKbs: notesVaultScope, runner });

    expect(readPattern(runner)).toBe('backpressure|dependency');
  });

  it('expands an alias query term to its canonical tag', async () => {
    // "node" is an alias for the canonical tag "nodejs"; notes carry canonical tags only, so the alias alone
    // would never match one.
    const runner = vi.fn<ProcessRunner>().mockResolvedValue({ stdout: '' });

    await recallNotes({ query: 'node', scopedKbs: notesVaultScope, runner });

    expect(readPattern(runner)).toBe('node|nodejs');
  });

  it('attributes each hit to its source KB name and path', async () => {
    const runner = vi
      .fn<ProcessRunner>()
      .mockResolvedValue({ stdout: buildRipgrepOutput([[join(NOTES_VAULT, 'streams.md'), 'notes on backpressure']]) });

    const { hits } = await recallNotes({ query: 'backpressure', scopedKbs: notesVaultScope, runner });

    expect(hits).toEqual([
      {
        path: join(NOTES_VAULT, 'streams.md'),
        kbName: 'notes',
        kbPath: NOTES_VAULT,
        snippet: 'notes on backpressure',
      },
    ]);
  });

  it('propagates a null kbName for a discovered KB with no registry entry', async () => {
    const scope: ScopedKb[] = [{ name: null, path: NOTES_VAULT, via: 'discovery' }];
    const runner = vi
      .fn<ProcessRunner>()
      .mockResolvedValue({ stdout: buildRipgrepOutput([[join(NOTES_VAULT, 'streams.md'), 'backpressure']]) });

    const { hits } = await recallNotes({ query: 'backpressure', scopedKbs: scope, runner });

    expect(hits[0]?.kbName).toBeNull();
  });

  it('returns no hits when ripgrep exits 1 to report that nothing matched', async () => {
    const runner = vi.fn<ProcessRunner>().mockRejectedValue(buildProcessError(1));

    const { hits } = await recallNotes({ query: 'zzzznomatch', scopedKbs: notesVaultScope, runner });

    expect(hits).toEqual([]);
  });

  it('throws a remediation hint when the ripgrep binary cannot be spawned', async () => {
    const runner = vi.fn<ProcessRunner>().mockRejectedValue(buildProcessError('ENOENT'));

    await expect(recallNotes({ query: 'backpressure', scopedKbs: notesVaultScope, runner })).rejects.toThrow(
      /requires ripgrep/,
    );
  });

  it('attaches the spawn failure as the cause of the remediation hint', async () => {
    const runner = vi.fn<ProcessRunner>().mockRejectedValue(buildProcessError('ENOENT'));

    await expect(recallNotes({ query: 'backpressure', scopedKbs: notesVaultScope, runner })).rejects.toHaveProperty(
      'cause',
      expect.any(Error),
    );
  });

  it('rethrows a ripgrep failure that is neither a no-match exit nor an absent binary', async () => {
    const runner = vi.fn<ProcessRunner>().mockRejectedValue(buildProcessError(2));

    await expect(recallNotes({ query: 'backpressure', scopedKbs: notesVaultScope, runner })).rejects.toThrow(
      /mock process failure: 2/,
    );
  });

  it('throws when ripgrep reports matches but none of its output can be parsed', async () => {
    const runner = vi.fn<ProcessRunner>().mockResolvedValue({ stdout: '{"type":"match","data":{"unexpected":true}}' });

    await expect(recallNotes({ query: 'backpressure', scopedKbs: notesVaultScope, runner })).rejects.toThrow(
      /--json event format/,
    );
  });

  it('runs no search at all for a blank query', async () => {
    const runner = vi.fn<ProcessRunner>();

    const { hits } = await recallNotes({ query: ' '.repeat(3), scopedKbs: notesVaultScope, runner });

    expect(hits).toEqual([]);
    expect(runner).not.toHaveBeenCalled();
  });

  it('skips a scoped KB whose path does not exist and reports it in missingKbs', async () => {
    const missing: ScopedKb = { name: 'missing', path: join(NOTES_VAULT, 'no-such-dir'), via: 'registry-all' };
    const runner = vi
      .fn<ProcessRunner>()
      .mockResolvedValue({ stdout: buildRipgrepOutput([[join(NOTES_VAULT, 'streams.md'), 'backpressure']]) });

    const { hits, missingKbs } = await recallNotes({
      query: 'backpressure',
      scopedKbs: [missing, ...notesVaultScope],
      runner,
    });

    expect(hits.map((hit) => hit.kbName)).toEqual(['notes']);
    expect(missingKbs).toEqual([missing]);
    expect(runner).toHaveBeenCalledTimes(1);
  });
});

describe(parseRipgrepOutput, () => {
  it('reads a note path from the structured field rather than from the line text', () => {
    // The date-patterned segments carry digit runs that resemble ripgrep's line-number field.
    const stream = buildRipgrepOutput([['/vault/2026-06-01/2026-05-01-meeting-notes.md', 'grumbletwist']]);

    expect(parseRipgrepOutput(stream)).toEqual([
      { path: '/vault/2026-06-01/2026-05-01-meeting-notes.md', snippet: 'grumbletwist' },
    ]);
  });

  it('skips a malformed JSON line and still returns valid matches', () => {
    // A line that is not valid JSON must be dropped silently, so that a single corrupted event does not lose the
    // surrounding valid matches in the same stream.
    const stream = [
      '{"type":"begin","data":{"path":{"text":"./a.md"}}}',
      'not json',
      String.raw`{"type":"match","data":{"path":{"text":"./a.md"},"lines":{"text":"hello world\n"},"line_number":1,"absolute_offset":0,"submatches":[]}}`,
      '{"type":"end","data":{"path":{"text":"./a.md"},"binary_offset":null,"stats":{}}}',
    ].join('\n');

    const entries = parseRipgrepOutput(stream);

    expect(entries).toEqual([{ path: './a.md', snippet: 'hello world' }]);
  });

  it('returns one entry per note and caps its snippet at the first match window', () => {
    // A note matching on several non-adjacent lines emits more than three line events. It must surface once, with a
    // snippet drawn from the first match and its neighbors only.
    const stream = buildRipgrepOutput([
      ['./multi.md', 'first thunderfish'],
      ['./multi.md', 'neighbor one'],
      ['./multi.md', 'neighbor two'],
      ['./multi.md', 'second thunderfish'],
    ]);

    const entries = parseRipgrepOutput(stream);

    expect(entries).toHaveLength(1);
    expect(entries[0]?.snippet).toBe('first thunderfish neighbor one neighbor two');
  });
});

/** Builds a child-process error carrying `code`, the shape `execFile` rejects with on a bad exit or a failed spawn. */
function buildProcessError(code: number | string): Error & { code: number | string } {
  return Object.assign(new Error(`mock process failure: ${code}`), { code });
}

/** Builds ripgrep `--json` stdout carrying one match event per `[notePath, lineText]` pair. */
function buildRipgrepOutput(matches: ReadonlyArray<readonly [string, string]>): string {
  return matches
    .map(([path, text]) =>
      JSON.stringify({ type: 'match', data: { path: { text: path }, lines: { text: `${text}\n` } } }),
    )
    .join('\n');
}

/** Reads the search pattern out of the recorded ripgrep invocation: the argument preceding the search directory. */
function readPattern(runner: Mock<ProcessRunner>): string | undefined {
  return runner.mock.calls[0]?.[1].at(-2);
}
