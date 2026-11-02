import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runCli } from '../cli.ts';
import { buildFakeDependencies, type FakeHandlers } from '../test-utils/fake-dependencies.ts';
import { buildReport } from '../test-utils/fixtures.ts';

describe('runCli', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'analyze-performance-cli-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it.each([
    ['an unknown command', ['nope']],
    ['collect without --url', ['collect', '--out', 'raw']],
    ['collect without --out', ['collect', '--url', 'https://example.com/']],
    ['a URL that is not http or https', ['collect', '--url', 'ftp://example.com/', '--out', 'raw']],
    ['a non-numeric --runs', ['collect', '--url', 'https://example.com/', '--out', 'raw', '--runs', 'many']],
    ['--runs above the cap', ['collect', '--url', 'https://example.com/', '--out', 'raw', '--runs', '11']],
    ['a repeated --out', ['collect', '--url', 'https://example.com/', '--out', 'a', '--out', 'b']],
    ['summarize without --in', ['summarize']],
  ])('reports invalid-args for %s', async (_label, argv) => {
    await expect(runCli(argv, context(root, {}))).resolves.toMatchObject({ ok: false, error: 'invalid-args' });
  });

  it('collects every repeated --url and summarizes the directory', async () => {
    const collected = await runCli(
      ['collect', '--url', 'http://localhost/a', '--url', 'http://localhost/b', '--out', 'raw', '--runs', '2'],
      context(root, { lighthouse: () => buildReport() }),
    );
    expect(collected).toMatchObject({
      ok: true,
      manifest: path.join(root, 'raw', 'manifest.json'),
      pages: [
        { slug: 'localhost-a', tool: 'lighthouse', runsSucceeded: 4, errors: [] },
        { slug: 'localhost-b', tool: 'lighthouse', runsSucceeded: 4, errors: [] },
      ],
    });

    const summary = await runCli(['summarize', '--in', 'raw'], context(root, {}));
    expect(summary).toMatchObject({ ok: true, lighthouseVersion: '13.6.0' });
  });

  it('routes a --private URL to the Lighthouse CLI', async () => {
    const result = await runCli(
      ['collect', '--url', 'https://preview.example.com/', '--private', 'https://preview.example.com/', '--out', 'raw'],
      context(root, { lighthouse: () => buildReport() }),
    );

    expect(result).toMatchObject({ ok: true, pages: [{ tool: 'lighthouse', fallbackReason: null }] });
  });

  it('reports lighthouse-failed when every run of every URL failed', async () => {
    const result = await runCli(
      ['collect', '--url', 'http://localhost/', '--out', 'raw'],
      context(root, { lighthouse: () => new Error('pnpm refused to install lighthouse') }),
    );

    expect(result).toMatchObject({
      ok: false,
      error: 'lighthouse-failed',
      message: expect.stringContaining('pnpm refused to install lighthouse'),
    });
  });

  it('reports input-not-found for a directory without a manifest', async () => {
    await expect(runCli(['summarize', '--in', 'missing'], context(root, {}))).resolves.toMatchObject({
      ok: false,
      error: 'input-not-found',
    });
  });

  it('reports invalid-input for a manifest that fails its schema', async () => {
    writeFileSync(path.join(root, 'manifest.json'), '{"version":2}', 'utf8');

    await expect(runCli(['summarize', '--in', '.'], context(root, {}))).resolves.toMatchObject({
      ok: false,
      error: 'invalid-input',
    });
  });
});

// region | Helpers

/** Builds a command context rooted at the test directory over fake dependencies. */
function context(root: string, handlers: FakeHandlers): Parameters<typeof runCli>[1] {
  return { root, collect: buildFakeDependencies(handlers).dependencies };
}

// endregion | Helpers
