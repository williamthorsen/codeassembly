import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { silenceConsole } from '@williamthorsen/toolbelt.vitest/candidate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { HARNESSES } from '../../lib/harness.ts';
import type { InstallOptions } from '../../lib/types.ts';
import { installCommand } from '../install.ts';
import { buildContentTree } from '../test-utils/build-content-tree.ts';

const ROVO_HOME = HARNESSES.rovo.homeDir;

/** A claude template shaped like the library's: a preamble, the shared-guidance include, and the ambient region. */
const SOURCE_CLAUDE_TEMPLATE = [
  'Org claude preamble.',
  '',
  '<!-- include: ../../shared/AGENTS.md / -->',
  '',
  '<!-- codeassembly-ambient:start -->',
  '<!-- codeassembly-ambient:end -->',
  '',
].join('\n');

describe('install with declared sources', () => {
  let tempDir: string;
  let contentDir: string;

  beforeEach(async () => {
    tempDir = path.join(tmpdir(), `agents-test-install-sources-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    contentDir = path.join(tempDir, 'content');
    await mkdir(path.join(tempDir, '.claude', 'skills'), { recursive: true });
    await mkdir(path.join(tempDir, '.claude', 'agents'), { recursive: true });
    await mkdir(path.join(tempDir, ROVO_HOME, 'skills'), { recursive: true });
    await mkdir(path.join(tempDir, ROVO_HOME, 'subagents'), { recursive: true });
    await buildContentTree(contentDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('deploys a script only the source ships', async () => {
    const sourceDir = await makeSource(tempDir, 'org', {
      scripts: { 'org-only.sh': '#!/usr/bin/env bash\necho org\n' },
    });
    await declareSources(tempDir, [{ name: 'org', dir: sourceDir }]);

    using _silent = silenceConsole(['info', 'warn']);
    await installCommand(makeOptions(), tempDir, contentDir);

    expect(await readScript(tempDir, 'org-only.sh')).toContain('echo org');
  });

  it('leaves the library scripts a source does not claim in place', async () => {
    const sourceDir = await makeSource(tempDir, 'org', {
      scripts: { 'org-only.sh': '#!/usr/bin/env bash\necho org\n' },
    });
    await declareSources(tempDir, [{ name: 'org', dir: sourceDir }]);

    using _silent = silenceConsole(['info', 'warn']);
    await installCommand(makeOptions(), tempDir, contentDir);

    expect(await readScript(tempDir, 'demo.sh')).toContain('echo demo');
  });

  it('installs a contested script from the source and warns', async () => {
    const sourceDir = await makeSource(tempDir, 'org', {
      scripts: { 'demo.sh': '#!/usr/bin/env bash\necho from-source\n' },
    });
    await declareSources(tempDir, [{ name: 'org', dir: sourceDir }]);

    using silent = silenceConsole(['info', 'warn']);
    await installCommand(makeOptions(), tempDir, contentDir);

    expect(await readScript(tempDir, 'demo.sh')).toContain('echo from-source');
    expect(warnedLines(silent.warn.mock.calls)).toMatch(
      /demo\.sh is shipped by more than one content root.*the built-in library/s,
    );
  });

  // A later-declared source shadows an earlier one, so `higher` is the one declared last.
  it('installs a contested script from the higher-precedence source and warns', async () => {
    const lower = await makeSource(tempDir, 'lower', {
      scripts: { 'contested.sh': '#!/usr/bin/env bash\necho lower\n' },
    });
    const higher = await makeSource(tempDir, 'higher', {
      scripts: { 'contested.sh': '#!/usr/bin/env bash\necho higher\n' },
    });
    await declareSources(tempDir, [
      { name: 'lower', dir: lower },
      { name: 'higher', dir: higher },
    ]);

    using silent = silenceConsole(['info', 'warn']);
    await installCommand(makeOptions(), tempDir, contentDir);

    expect(await readScript(tempDir, 'contested.sh')).toContain('echo higher');
    expect(warnedLines(silent.warn.mock.calls)).toMatch(
      /contested\.sh is shipped by more than one content root.*"lower"/s,
    );
  });

  it('deploys from the library alone when no declaration exists', async () => {
    using _silent = silenceConsole(['info', 'warn']);
    await installCommand(makeOptions(), tempDir, contentDir);

    expect(await readScript(tempDir, 'demo.sh')).toContain('echo demo');
  });

  it('warns about a declared source whose directory does not exist and installs from the library', async () => {
    await declareSources(tempDir, [{ name: 'not-yet', dir: path.join(tempDir, 'not-yet') }]);

    using silent = silenceConsole(['info', 'warn']);
    await installCommand(makeOptions(), tempDir, contentDir);

    expect(warnedLines(silent.warn.mock.calls)).toMatch(/Declared source "not-yet".*does not exist/s);
    expect(await readScript(tempDir, 'demo.sh')).toContain('echo demo');
  });

  it('refuses a declared source that is not a directory, writing nothing', async () => {
    const filePath = path.join(tempDir, 'a-file');
    await writeFile(filePath, '', 'utf8');
    await declareSources(tempDir, [{ name: 'a-file', dir: filePath }]);

    await expect(installCommand(makeOptions(), tempDir, contentDir)).rejects.toThrow(/Invalid declared source/);
    expect(existsSync(path.join(tempDir, '.claude', 'scripts'))).toBe(false);
  });

  it('refuses an unusable declared source on a dry run exactly as it refuses the real run', async () => {
    const filePath = path.join(tempDir, 'a-file');
    await writeFile(filePath, '', 'utf8');
    await declareSources(tempDir, [{ name: 'a-file', dir: filePath }]);

    await expect(installCommand(makeOptions({ dryRun: true }), tempDir, contentDir)).rejects.toThrow(
      /Invalid declared source/,
    );
  });

  it('refuses a declared source declaring an unsupported content format on a dry run', async () => {
    const sourceDir = await makeSource(tempDir, 'future', {});
    await writeFile(path.join(sourceDir, 'codeassembly-content.yaml'), 'format: 99\n', 'utf8');
    await declareSources(tempDir, [{ name: 'future', dir: sourceDir }]);

    await expect(installCommand(makeOptions({ dryRun: true }), tempDir, contentDir)).rejects.toThrow(
      /Unsupported content format/,
    );
  });

  it('deploys a source template with its own shared guidance inlined', async () => {
    const sourceDir = await makeSource(tempDir, 'org', {
      claudeGuidance: { 'CLAUDE.md': SOURCE_CLAUDE_TEMPLATE },
      sharedGuidance: { 'AGENTS.md': '# Org shared guidance\n' },
    });
    await declareSources(tempDir, [{ name: 'org', dir: sourceDir }]);

    using _silent = silenceConsole(['info', 'warn']);
    await installCommand(makeOptions(), tempDir, contentDir);

    const deployed = await readGuidance(tempDir);
    expect(deployed).toContain('Org claude preamble.');
    expect(deployed).toContain('Org shared guidance');
    expect(deployed).not.toContain('Fixture shared guidance');
  });

  it("names the source in the deployed template's provenance marker", async () => {
    const sourceDir = await makeSource(tempDir, 'org', {
      claudeGuidance: { 'CLAUDE.md': SOURCE_CLAUDE_TEMPLATE },
      sharedGuidance: { 'AGENTS.md': '# Org shared guidance\n' },
    });
    await declareSources(tempDir, [{ name: 'org', dir: sourceDir }]);

    using _silent = silenceConsole(['info', 'warn']);
    await installCommand(makeOptions(), tempDir, contentDir);

    expect(await readGuidance(tempDir)).toContain(
      `Source: guidance/_harnesses/claude/CLAUDE.md in source "org" (${sourceDir})`,
    );
  });

  it('fails when a source ships a template but not the shared guidance it includes', async () => {
    const sourceDir = await makeSource(tempDir, 'org', {
      claudeGuidance: { 'CLAUDE.md': SOURCE_CLAUDE_TEMPLATE },
    });
    await declareSources(tempDir, [{ name: 'org', dir: sourceDir }]);

    using _silent = silenceConsole(['info', 'warn']);
    await expect(installCommand(makeOptions(), tempDir, contentDir)).rejects.toThrow(
      /Include directive target not found.*org\/guidance\/shared\/AGENTS\.md/s,
    );
  });

  it('installs the template from the higher-precedence root and warns', async () => {
    const sourceDir = await makeSource(tempDir, 'org', {
      claudeGuidance: { 'CLAUDE.md': SOURCE_CLAUDE_TEMPLATE },
      sharedGuidance: { 'AGENTS.md': '# Org shared guidance\n' },
    });
    await declareSources(tempDir, [{ name: 'org', dir: sourceDir }]);

    using silent = silenceConsole(['info', 'warn']);
    await installCommand(makeOptions(), tempDir, contentDir);

    expect(warnedLines(silent.warn.mock.calls)).toMatch(
      /claude guidance template is shipped by more than one content root.*the built-in library/s,
    );
  });

  // A template carries the ambient region `sync --global` writes into. Install deploys one that omits it, leaving the
  // region's absence for sync to classify and report.
  it('deploys a source template carrying no ambient region', async () => {
    const sourceDir = await makeSource(tempDir, 'org', {
      claudeGuidance: { 'CLAUDE.md': 'Org claude preamble, no ambient region.\n' },
    });
    await declareSources(tempDir, [{ name: 'org', dir: sourceDir }]);

    using _silent = silenceConsole(['info', 'warn']);
    await installCommand(makeOptions(), tempDir, contentDir);

    const deployed = await readGuidance(tempDir);
    expect(deployed).toContain('Org claude preamble, no ambient region.');
    expect(deployed).not.toContain('codeassembly-ambient:start');
  });

  it('ignores a subdirectory in the owning source template directory', async () => {
    const sourceDir = await makeSource(tempDir, 'org', {
      claudeGuidance: { 'CLAUDE.md': SOURCE_CLAUDE_TEMPLATE },
      sharedGuidance: { 'AGENTS.md': '# Org shared guidance\n' },
    });
    await mkdir(path.join(sourceDir, 'guidance', '_harnesses', 'claude', 'fragments'), { recursive: true });
    await writeFile(
      path.join(sourceDir, 'guidance', '_harnesses', 'claude', 'fragments', 'partial.md'),
      '# Fragment\n',
      'utf8',
    );
    await declareSources(tempDir, [{ name: 'org', dir: sourceDir }]);

    using _silent = silenceConsole(['info', 'warn']);
    await installCommand(makeOptions(), tempDir, contentDir);

    expect(await readGuidance(tempDir)).toContain('Org claude preamble.');
    expect(existsSync(path.join(tempDir, '.claude', 'fragments'))).toBe(false);
  });

  it('falls back to the library when a source ships only a subdirectory for the harness', async () => {
    const sourceDir = path.join(tempDir, 'sources', 'org');
    await mkdir(path.join(sourceDir, 'guidance', '_harnesses', 'claude', 'fragments'), { recursive: true });
    await writeFile(
      path.join(sourceDir, 'guidance', '_harnesses', 'claude', 'fragments', 'partial.md'),
      '# Fragment\n',
      'utf8',
    );
    await declareSources(tempDir, [{ name: 'org', dir: sourceDir }]);

    using _silent = silenceConsole(['info', 'warn']);
    await installCommand(makeOptions(), tempDir, contentDir);

    expect(await readGuidance(tempDir)).toContain('Fixture claude preamble.');
  });

  it('retracts a template file the owning source does not ship', async () => {
    using _silent = silenceConsole(['info', 'warn']);
    await installCommand(makeOptions({ harness: 'rovo' }), tempDir, contentDir);
    expect(existsSync(path.join(tempDir, ROVO_HOME, 'codeassembly-guidance.md'))).toBe(true);

    const sourceDir = path.join(tempDir, 'sources', 'org');
    await mkdir(path.join(sourceDir, 'guidance', '_harnesses', 'rovo'), { recursive: true });
    await writeFile(
      path.join(sourceDir, 'guidance', '_harnesses', 'rovo', 'AGENTS.md'),
      ['Org rovo preamble.', '', '<!-- codeassembly-ambient:start -->', '<!-- codeassembly-ambient:end -->', ''].join(
        '\n',
      ),
      'utf8',
    );
    await declareSources(tempDir, [{ name: 'org', dir: sourceDir }]);

    await installCommand(makeOptions({ harness: 'rovo' }), tempDir, contentDir);

    expect(existsSync(path.join(tempDir, ROVO_HOME, 'codeassembly-guidance.md'))).toBe(false);
  });
});

// region | Helpers

/** Writes a home declaration under `homeDir` naming `sources` in precedence order. */
async function declareSources(homeDir: string, sources: ReadonlyArray<{ name: string; dir: string }>): Promise<void> {
  const body = sources.map((source) => `  - name: '${source.name}'\n    path: ${source.dir}`).join('\n');
  await mkdir(path.join(homeDir, '.agents'), { recursive: true });
  await writeFile(path.join(homeDir, '.agents', 'codeassembly.yaml'), `sources:\n${body}\n`, 'utf8');
}

/** Creates a source content root under `homeDir` holding the given scripts, claude template, and shared guidance. */
async function makeSource(
  homeDir: string,
  name: string,
  content: {
    claudeGuidance?: Record<string, string>;
    scripts?: Record<string, string>;
    sharedGuidance?: Record<string, string>;
  },
): Promise<string> {
  const dir = path.join(homeDir, 'sources', name);
  await mkdir(dir, { recursive: true });
  await writeFileMap(path.join(dir, 'scripts'), content.scripts);
  await writeFileMap(path.join(dir, 'guidance', '_harnesses', 'claude'), content.claudeGuidance);
  await writeFileMap(path.join(dir, 'guidance', 'shared'), content.sharedGuidance);
  return dir;
}

/** Writes a flat map of file name to content into `dir`, doing nothing when the map is absent. */
async function writeFileMap(dir: string, files: Record<string, string> | undefined): Promise<void> {
  if (files === undefined) {
    return;
  }
  await mkdir(dir, { recursive: true });
  for (const [fileName, body] of Object.entries(files)) {
    await writeFile(path.join(dir, fileName), body, 'utf8');
  }
}

function makeOptions(overrides: Partial<InstallOptions> = {}): InstallOptions {
  return { harness: 'claude', link: false, force: false, dryRun: false, ...overrides };
}

/** Joins every line a silenced run wrote to `console.warn`, so one regex can match across them. */
function warnedLines(calls: ReadonlyArray<ReadonlyArray<unknown>>): string {
  return calls.map((call) => String(call[0])).join('\n');
}

/** Reads the claude guidance file the install deployed into the harness home. */
async function readGuidance(homeDir: string): Promise<string> {
  return readFile(path.join(homeDir, '.claude', 'CLAUDE.md'), 'utf8');
}

/** Reads a script the install deployed into the claude harness home. */
async function readScript(homeDir: string, name: string): Promise<string> {
  return readFile(path.join(homeDir, '.claude', 'scripts', name), 'utf8');
}

// endregion | Helpers
