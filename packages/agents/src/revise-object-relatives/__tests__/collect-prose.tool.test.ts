import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { collectProse, NotARepositoryError, type ProseCollection } from '../collect-prose.ts';

/** The fixture tree, written into a throwaway repository so no sweep runs against the working checkout. */
const FIXTURE_FILES: Readonly<Record<string, string>> = {
  '.gitignore': 'ignored/\n',
  '.claude/skills/deployed/SKILL.md': 'Deployed prose the sweep may not edit.\n',
  'docs/guide.md': 'Authored prose the sweep reads.\n',
  'generated.md': '<!-- GENERATED FILE: do not edit -->\n\nCopied prose the sweep may not edit.\n',
  'marker-docs.md': 'A file marked `GENERATED FILE` is deployed output.\n\nDocumented prose the sweep reads.\n',
  'ignored/notes.md': 'Ignored prose the sweep never sees.\n',
  'src/helper.ts': '/** Authored doc prose the sweep reads. */\nexport const helper = 1;\n',
};

describe(collectProse, () => {
  let scratch: string;

  beforeEach(async () => {
    scratch = await mkdtemp(path.join(tmpdir(), 'revise-object-relatives-'));
    execFileSync('git', ['-C', scratch, 'init', '--quiet']);
    for (const [file, content] of Object.entries(FIXTURE_FILES)) {
      await mkdir(path.join(scratch, path.dirname(file)), { recursive: true });
      await writeFile(path.join(scratch, file), content, 'utf8');
    }
  });

  afterEach(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  it('reads authored Markdown and TypeScript prose', async () => {
    const text = joinText(await sweep());

    expect(text).toContain('Authored prose the sweep reads.');
    expect(text).toContain('Authored doc prose the sweep reads.');
  });

  it('yields nothing from a deployed harness skills path', async () => {
    const collection = await sweep();

    expect(collection.files).not.toContain('.claude/skills/deployed/SKILL.md');
    expect(joinText(collection)).not.toContain('Deployed prose');
  });

  it('yields nothing from a marker-bearing file', async () => {
    const collection = await sweep();

    expect(joinText(collection)).not.toContain('Copied prose');
    expect(collection.skipped.generated).toBe(1);
  });

  it('reads a file that names the marker mid-sentence, which is prose about the marker', async () => {
    expect(joinText(await sweep())).toContain('Documented prose the sweep reads.');
  });

  it('counts the files it read, so a silent exclusion cannot read as a clean sweep', async () => {
    const collection = await sweep();

    expect(collection.scanned).toBe(3);
  });

  it('yields nothing from a gitignored path', async () => {
    const collection = await sweep();

    expect(collection.files).not.toContain('ignored/notes.md');
    expect(joinText(collection)).not.toContain('Ignored prose');
  });

  it('narrows the sweep to the paths it is given', async () => {
    const collection = await sweep(['src']);

    expect(collection.files).toStrictEqual(['src/helper.ts']);
  });

  it('refuses a directory git does not track', async () => {
    const outside = await mkdtemp(path.join(tmpdir(), 'revise-object-relatives-bare-'));
    try {
      await expect(collectProse({ root: outside, home: outside })).rejects.toThrow(NotARepositoryError);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  // region | Helpers

  /** Sweeps the fixture repository, anchoring `home` at the scratch tree so no real preferences reach the run. */
  async function sweep(paths: readonly string[] = []): Promise<ProseCollection> {
    return collectProse({ root: scratch, paths, home: scratch });
  }

  // endregion | Helpers
});

// region | Helpers

/** Joins every span's text, for the assertions that ask what the whole sweep did and did not carry. */
function joinText(collection: ProseCollection): string {
  return collection.spans.map((span) => span.text).join('\n');
}

// endregion | Helpers
