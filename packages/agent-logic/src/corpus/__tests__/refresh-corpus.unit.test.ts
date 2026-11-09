import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runInputSchema } from '../corpus-schemas.ts';
import { type GitReader, refreshCorpus } from '../refresh-corpus.ts';

const BUILD_COMMIT = '1111111111111111111111111111111111111111';
const PERSONAL_COMMIT = '2222222222222222222222222222222222222222';
const PLUGIN_COMMIT = '3333333333333333333333333333333333333333';
// Bytes that a text round trip would alter: a BOM, CRLF line ends, and no final newline.
const GREETER_SKILL = '\u{FEFF}# Greeter\r\n\r\nGreet the user.';
const RULES_SKILL = '# Rules\n\nFollow the rules.\n';

const HAND_WRITTEN_RUN = {
  sources: {
    codeassembly: {
      kind: 'codeassembly',
      repository: 'williamthorsen/codeassembly',
      license: 'ISC',
      declared: [
        { name: 'codeassembly-guidance', path: '~/repos/codeassembly/packages/guidance/content' },
        { name: 'personal', path: '~/.agents/content' },
      ],
    },
    superpowers: {
      kind: 'plugin',
      plugin: 'superpowers@claude-plugins-official',
      repository: 'obra/superpowers',
      license: 'MIT',
    },
  },
  prompts: {
    greeter: { source: 'codeassembly', path: 'skills/greeter/SKILL.md' },
    rules: { source: 'superpowers', path: 'skills/rules/SKILL.md' },
  },
};

describe(refreshCorpus, () => {
  let home = '';
  let corpus = '';

  beforeEach(() => {
    home = mkdtempSync(path.join(os.tmpdir(), 'refresh-corpus-home-'));
    corpus = mkdtempSync(path.join(os.tmpdir(), 'refresh-corpus-'));
    writeHome(home);
    mkdirSync(path.join(corpus, 'records'));
    writeFileSync(path.join(corpus, 'records/run.json'), JSON.stringify(HAND_WRITTEN_RUN));
    writeFileSync(path.join(corpus, 'greeter.md'), 'The source text.\n');
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
    rmSync(corpus, { recursive: true, force: true });
  });

  it('copies each deployed prompt byte for byte', () => {
    refreshCorpus({ corpusDirectory: corpus, home, readGit: buildGitReader(home) });

    expect(readFileSync(path.join(corpus, 'greeter.md'), 'utf8')).toBe(GREETER_SKILL);
    expect(readFileSync(path.join(corpus, 'rules.md'), 'utf8')).toBe(RULES_SKILL);
  });

  it('records the build, the declared commits, and the plugin version and commit', () => {
    refreshCorpus({ corpusDirectory: corpus, home, readGit: buildGitReader(home) });

    const run = runInputSchema.parse(JSON.parse(readFileSync(path.join(corpus, 'records/run.json'), 'utf8')));
    expect(run.sources).toStrictEqual({
      codeassembly: {
        ...HAND_WRITTEN_RUN.sources.codeassembly,
        build: {
          version: '0.20.0',
          sourcePath: '~/repos/codeassembly/packages/agents',
          sourceCommit: BUILD_COMMIT,
          command: 'sync --global',
          writtenAt: '2026-11-02T10:26:38.594Z',
        },
        declared: [
          { ...HAND_WRITTEN_RUN.sources.codeassembly.declared[0], commit: BUILD_COMMIT, pinnedByBuild: true },
          { ...HAND_WRITTEN_RUN.sources.codeassembly.declared[1], commit: PERSONAL_COMMIT, pinnedByBuild: false },
        ],
      },
      superpowers: { ...HAND_WRITTEN_RUN.sources.superpowers, version: '7.0.0', commit: PLUGIN_COMMIT },
    });
  });

  it.each([
    [
      'the source that the build pins has moved past the build',
      () => buildGitReader(home, { guidance: { head: '4444444444444444444444444444444444444444' } }),
      /codeassembly-guidance is at 4{40}, but the deployed build ran from/,
    ],
    [
      'the source that the build pins has uncommitted changes',
      () => buildGitReader(home, { guidance: { status: ' M skills/greeter/SKILL.md' } }),
      /codeassembly-guidance has uncommitted changes/,
    ],
    [
      'another source changed after the build',
      () => buildGitReader(home, { personal: { committedAt: '2026-11-02T10:26:39Z' } }),
      /personal changed in 2{40} at 2026-11-02T10:26:39Z, after the deployed build/,
    ],
    [
      'another source has uncommitted changes',
      () => buildGitReader(home, { personal: { status: '?? rulebooks/new.md' } }),
      /personal has uncommitted changes/,
    ],
  ] satisfies [string, () => GitReader, RegExp][])(
    'throws and writes nothing when %s',
    (_condition, readGit, message) => {
      expect(() => refreshCorpus({ corpusDirectory: corpus, home, readGit: readGit() })).toThrow(message);
      expectUntouched(corpus);
    },
  );

  it('throws and writes nothing when a deployed file is missing', () => {
    rmSync(path.join(home, '.claude/skills/greeter/SKILL.md'));

    expect(() => refreshCorpus({ corpusDirectory: corpus, home, readGit: buildGitReader(home) })).toThrow(
      /greeter: the deployed file .* does not exist/,
    );
    expectUntouched(corpus);
  });

  it('throws and writes nothing when a prompt names an unknown source', () => {
    const run = { ...HAND_WRITTEN_RUN, prompts: { greeter: { source: 'elsewhere', path: 'skills/greeter/SKILL.md' } } };
    writeFileSync(path.join(corpus, 'records/run.json'), JSON.stringify(run));

    expect(() => refreshCorpus({ corpusDirectory: corpus, home, readGit: buildGitReader(home) })).toThrow(
      /lists no source "elsewhere"/,
    );
    expect(readFileSync(path.join(corpus, 'greeter.md'), 'utf8')).toBe('The source text.\n');
  });
});

// region | Helpers
/** Returns a git reader over the fixture home: the guidance and the build share a repository, `personal` has its own. */
function buildGitReader(
  home: string,
  {
    guidance = {},
    personal = {},
  }: { guidance?: { head?: string; status?: string }; personal?: { committedAt?: string; status?: string } } = {},
): GitReader {
  const codeassemblyTop = path.join(home, 'repos/codeassembly');
  const personalTop = path.join(home, '.agents/content');
  return (directory, args) => {
    const command = args.join(' ');
    const isCodeassembly = directory.startsWith(codeassemblyTop);
    if (command === 'rev-parse --show-toplevel') return isCodeassembly ? codeassemblyTop : personalTop;
    if (command === 'rev-parse HEAD' && isCodeassembly) return guidance.head ?? BUILD_COMMIT;
    if (command === 'log -1 --format=%H %cI -- .' && !isCodeassembly) {
      return `${PERSONAL_COMMIT} ${personal.committedAt ?? '2026-11-01T17:37:19-07:00'}`;
    }
    if (command === 'status --porcelain -- .') return (isCodeassembly ? guidance.status : personal.status) ?? '';
    throw new Error(`Unexpected git ${command} in ${directory}`);
  };
}

/** Asserts that the corpus still holds only its hand-written files. */
function expectUntouched(corpus: string) {
  expect(readFileSync(path.join(corpus, 'greeter.md'), 'utf8')).toBe('The source text.\n');
  expect(JSON.parse(readFileSync(path.join(corpus, 'records/run.json'), 'utf8'))).toStrictEqual(HAND_WRITTEN_RUN);
}

/** Writes the deployed files, the build record, and the plugin record under the home directory. */
function writeHome(home: string) {
  const pluginRoot = path.join(home, '.claude/plugins/cache/superpowers/7.0.0');
  const files: Record<string, string> = {
    '.claude/skills/greeter/SKILL.md': GREETER_SKILL,
    [path.relative(home, path.join(pluginRoot, 'skills/rules/SKILL.md'))]: RULES_SKILL,
    '.codeassembly/home-provenance.json': JSON.stringify({
      lastWrite: {
        version: '0.20.0',
        sourcePath: path.join(home, 'repos/codeassembly/packages/agents'),
        sourceCommit: BUILD_COMMIT,
        command: 'sync --global',
        writtenAt: '2026-11-02T10:26:38.594Z',
      },
    }),
    '.claude/plugins/installed_plugins.json': JSON.stringify({
      plugins: {
        'superpowers@claude-plugins-official': [
          { scope: 'user', installPath: pluginRoot, version: '7.0.0', gitCommitSha: PLUGIN_COMMIT },
        ],
        // A plugin installed from a directory records no commit.
        'local@marketplace': [{ scope: 'user', installPath: path.join(home, 'local'), version: '1.0.0' }],
      },
    }),
  };
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(home, file)), { recursive: true });
    writeFileSync(path.join(home, file), content);
  }
  for (const directory of [
    'repos/codeassembly/packages/agents',
    'repos/codeassembly/packages/guidance/content',
    '.agents/content',
  ]) {
    mkdirSync(path.join(home, directory), { recursive: true });
  }
}
// endregion | Helpers
