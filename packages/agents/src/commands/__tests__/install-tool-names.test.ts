import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ToolNameRewriteError } from '../../lib/tool-name-rewriter.js';
import type { InstallOptions } from '../../lib/types.js';
import { installCommand } from '../install.js';

/**
 * Integration coverage for the `{tool:NAME}` placeholder rewriter. Builds a synthetic content
 * tree with deliberately-targeted placeholders, runs the install pipeline against it, and
 * asserts both the success path (Rovo Dev rewrites prose to mapped names) and the failure
 * path (an unmapped placeholder aborts install with a file-and-line-anchored error).
 */
describe('tool-name placeholder rewriting end-to-end', () => {
  let tempDir: string;
  let contentDir: string;
  const installOptions: InstallOptions = { platform: 'rovodev', link: false, force: false, dryRun: false };

  beforeEach(async () => {
    tempDir = path.join(tmpdir(), `agents-test-tool-names-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    contentDir = path.join(tempDir, 'content');
    await mkdir(path.join(tempDir, '.rovodev', 'subagents'), { recursive: true });
    await mkdir(path.join(tempDir, '.rovodev', 'skills'), { recursive: true });
    await mkdir(path.join(contentDir, 'skills'), { recursive: true });
    await mkdir(path.join(contentDir, 'subagents', '_data'), { recursive: true });
    await mkdir(path.join(contentDir, 'guidance', 'shared'), { recursive: true });

    // Minimal Rovo Dev overlay with a complete _tools: mapping.
    await writeFile(
      path.join(contentDir, 'subagents', '_data', 'rovodev.yml'),
      [
        '_tools:',
        '  Bash: bash',
        '  Edit: find_and_replace_code',
        '  Glob: expand_folder',
        '  Grep: grep',
        '  Read: open_files',
        '  Write: create_file',
        '',
        '_defaults:',
        '  tools: [bash, open_files, create_file]',
        '',
      ].join('\n'),
    );

    // Stub shared guidance so installSharedGuidance has something to iterate over.
    await writeFile(path.join(contentDir, 'guidance', 'shared', 'AGENTS.md'), '# Stub\n');
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('rewrites {tool:Read} in subagent body to the Rovo Dev mapping at install time', async () => {
    await writeFile(
      path.join(contentDir, 'subagents', 'fixture-agent.md'),
      [
        '---',
        'name: fixture-agent',
        'description: A test agent',
        '---',
        '',
        '# Body',
        '',
        'Use `{tool:Read}` to inspect files and `{tool:Grep}` to search.',
        '',
      ].join('\n'),
    );

    await installCommand(installOptions, tempDir, contentDir);

    const installed = await readFile(path.join(tempDir, '.rovodev', 'subagents', 'fixture-agent.md'), 'utf8');
    expect(installed).toContain('Use `open_files` to inspect files and `grep` to search.');
    expect(installed).not.toContain('{tool:Read}');
    expect(installed).not.toContain('{tool:Grep}');
  });

  it('rewrites {tool:NAME} placeholders inside a directory-form skill before write', async () => {
    const skillDir = path.join(contentDir, 'skills', 'fixture-dir-skill');
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      path.join(skillDir, 'SKILL.md'),
      ['# Fixture dir skill', '', 'Use `{tool:Glob}` and `{tool:Read}`.', ''].join('\n'),
    );

    await installCommand(installOptions, tempDir, contentDir);

    const installed = await readFile(path.join(tempDir, '.rovodev', 'skills', 'fixture-dir-skill', 'SKILL.md'), 'utf8');
    expect(installed).toContain('Use `expand_folder` and `open_files`.');
  });

  it('aborts install with a file-and-line-anchored error when a subagent uses an unmapped placeholder', async () => {
    await writeFile(
      path.join(contentDir, 'subagents', 'bad-agent.md'),
      [
        '---',
        'name: bad-agent',
        'description: An agent with a typo',
        '---',
        '',
        '# Body',
        '',
        'Use `{tool:NonExistent}` for nothing.',
        '',
      ].join('\n'),
    );

    let caught: unknown;
    try {
      await installCommand(installOptions, tempDir, contentDir);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ToolNameRewriteError);
    if (!(caught instanceof ToolNameRewriteError)) {
      throw caught;
    }
    expect(caught.toolName).toBe('NonExistent');
    expect(caught.contextLabel).toBe('subagents/bad-agent.md');
    expect(caught.line).toBeGreaterThan(1);
    expect(caught.message).toContain('subagents/bad-agent.md:');
    expect(caught.message).toContain('NonExistent');
  });

  it('aborts install with a file-and-line-anchored error when a skill uses an unmapped placeholder', async () => {
    const skillDir = path.join(contentDir, 'skills', 'bad-skill');
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      path.join(skillDir, 'SKILL.md'),
      ['# Bad skill', '', 'Use `{tool:Phantom}` for nothing.', ''].join('\n'),
    );

    let caught: unknown;
    try {
      await installCommand(installOptions, tempDir, contentDir);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ToolNameRewriteError);
    if (!(caught instanceof ToolNameRewriteError)) {
      throw caught;
    }
    expect(caught.toolName).toBe('Phantom');
    expect(caught.contextLabel).toContain('skills/bad-skill/SKILL.md');
    expect(caught.line).toBeGreaterThan(1);
  });
});
