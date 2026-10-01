import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readHelperTargets } from '../helper-manifest.ts';

describe(readHelperTargets, () => {
  let contentRoot: string;

  beforeEach(async () => {
    contentRoot = await mkdtemp(path.join(tmpdir(), 'helper-manifest-'));
  });

  afterEach(async () => {
    await rm(contentRoot, { recursive: true, force: true });
  });

  it('returns no helpers when the content root does not contain a manifest', async () => {
    expect(await readHelperTargets(contentRoot)).toEqual([]);
  });

  it('returns no helpers when the manifest does not declare the key', async () => {
    await writeManifest(contentRoot, 'format: 2\n');

    expect(await readHelperTargets(contentRoot)).toEqual([]);
  });

  it('resolves each entry against the manifest directory and keeps it as written', async () => {
    await writeManifest(
      contentRoot,
      'format: 2\nhelpers:\n  - entry: ../src/demo/cli.ts\n    out: skills/demo/./demo.mjs\n',
    );

    expect(await readHelperTargets(contentRoot)).toEqual([
      {
        entry: '../src/demo/cli.ts',
        entryPath: path.resolve(contentRoot, '../src/demo/cli.ts'),
        out: 'skills/demo/demo.mjs',
      },
    ]);
  });

  it('rejects an entry that is not an object of two strings, naming its index', async () => {
    await writeManifest(contentRoot, 'helpers:\n  - entry: ../src/demo/cli.ts\n');

    await expect(readHelperTargets(contentRoot)).rejects.toThrow(/helpers\.0\.out/);
  });

  it('rejects an entry with an unknown key', async () => {
    await writeManifest(contentRoot, 'helpers:\n  - entry: ../src/demo/cli.ts\n    out: demo.mjs\n    minify: false\n');

    await expect(readHelperTargets(contentRoot)).rejects.toThrow(/helpers\.0/);
  });

  it('rejects an out that resolves outside the content root', async () => {
    await writeManifest(contentRoot, 'helpers:\n  - entry: ../src/demo/cli.ts\n    out: ../dist/demo.mjs\n');

    await expect(readHelperTargets(contentRoot)).rejects.toThrow(/helpers\.0\.out: .* must be inside the content root/);
  });

  it('rejects an out that does not end in .mjs', async () => {
    await writeManifest(contentRoot, 'helpers:\n  - entry: ../src/demo/cli.ts\n    out: skills/demo/demo.js\n');

    await expect(readHelperTargets(contentRoot)).rejects.toThrow(/helpers\.0\.out: .* must end in \.mjs/);
  });

  it('rejects two helpers that write the same out', async () => {
    await writeManifest(
      contentRoot,
      'helpers:\n  - entry: ../src/a/cli.ts\n    out: scripts/a.mjs\n  - entry: ../src/b/cli.ts\n    out: ./scripts/a.mjs\n',
    );

    await expect(readHelperTargets(contentRoot)).rejects.toThrow(/helpers\.1\.out: .* earlier helper/);
  });

  it('names the manifest when its YAML is malformed', async () => {
    await writeManifest(contentRoot, 'helpers: [\n');

    await expect(readHelperTargets(contentRoot)).rejects.toThrow(/codeassembly-content\.yaml: malformed YAML/);
  });
});

// region | Helpers

/** Writes the manifest of the content root at `contentRoot`. */
async function writeManifest(contentRoot: string, text: string): Promise<void> {
  await writeFile(path.join(contentRoot, 'codeassembly-content.yaml'), text, 'utf8');
}

// endregion | Helpers
