import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DirectiveExpansionError } from '../directive-expander.ts';
import { type RenderedSkillEntry, renderSkillDirectory, type SkillDeployContext } from '../skill-transform.ts';
import { ToolNameRewriteError } from '../tool-name-rewriter.ts';

const TOOL_MAPPING = new Map([['Read', 'open_files']]);

describe(renderSkillDirectory, () => {
  let contentDir: string;
  let skillDir: string;

  beforeEach(async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    contentDir = path.join(tmpdir(), `agents-test-st-${stamp}`);
    skillDir = path.join(contentDir, 'skills', 'demo');
    await mkdir(skillDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(contentDir, { recursive: true, force: true });
  });

  it('expands includes, rewrites tool placeholders, and expands template variables in SKILL.md', async () => {
    await writeSkill({
      'SKILL.md':
        '# Demo\n\n<!-- include: _partials/frag.md / -->\n\nUse the {tool:Read} tool at `{harness_home_dir}/x`.\n',
      '_partials/frag.md': 'Shared fragment.\n',
    });

    const entries = await renderSkillDirectory(skillDir, 'demo', contentDir, context());

    const content = markdownContent(entries, 'SKILL.md');
    expect(content).toContain('Shared fragment.');
    expect(content).toContain('Use the open_files tool');
    expect(content).toContain('~/.claude/x');
    expect(content).not.toContain('{tool:Read}');
    expect(content).not.toContain('include:');
    // The partial is an include target, never a deployed entry.
    expect(entries.some((entry) => entry.relPath.startsWith('_partials'))).toBe(false);
  });

  it('rewrites invocation tokens to their harness-rendered form, including a token inside an included partial', async () => {
    await writeSkill({
      'SKILL.md': '# Demo\n\nDispatch {subagent:code-reviewer}.\n\n<!-- include: _partials/frag.md / -->\n',
      '_partials/frag.md': 'Then invoke {skill:capture-event}.\n',
    });

    const claude = markdownContent(await renderSkillDirectory(skillDir, 'demo', contentDir, context()), 'SKILL.md');
    expect(claude).toContain('Dispatch code-reviewer.');
    expect(claude).toContain('Then invoke /capture-event.');
    expect(claude).not.toContain('{skill:');
    expect(claude).not.toContain('{subagent:');

    const rovo = markdownContent(
      await renderSkillDirectory(skillDir, 'demo', contentDir, context({ skillSigil: '!' })),
      'SKILL.md',
    );
    expect(rovo).toContain('Then invoke !capture-event.');
  });

  it('rewrites a bare-relative link in a nested .md against the skill slug and prefix', async () => {
    await writeSkill({ 'SKILL.md': '# Demo\n', 'reference/guide.md': 'See [the data](../data/table.csv).\n' });

    const entries = await renderSkillDirectory(skillDir, 'demo', contentDir, context());

    expect(markdownContent(entries, 'reference/guide.md')).toContain(
      '[the data](~/.claude/skills/demo/data/table.csv)',
    );
  });

  it('returns non-.md files as assets pointing at the source path', async () => {
    await writeSkill({ 'SKILL.md': '# Demo\n', 'data/table.csv': 'a,b\n1,2\n' });

    const entries = await renderSkillDirectory(skillDir, 'demo', contentDir, context());

    expect(entries.find((entry) => entry.relPath === 'data/table.csv')).toEqual({
      kind: 'asset',
      relPath: 'data/table.csv',
      srcPath: path.join(skillDir, 'data', 'table.csv'),
    });
  });

  it('throws a file/line-anchored error for an unmapped tool placeholder', async () => {
    await writeSkill({ 'SKILL.md': '# Demo\n\nUse {tool:Bash}.\n' });

    await expect(renderSkillDirectory(skillDir, 'demo', contentDir, context())).rejects.toThrow(ToolNameRewriteError);
    await expect(renderSkillDirectory(skillDir, 'demo', contentDir, context())).rejects.toThrow(
      /skills\/demo\/SKILL\.md:3/,
    );
  });

  it('throws on a broken include directive', async () => {
    await writeSkill({ 'SKILL.md': '# Demo\n\n<!-- include: _partials/missing.md / -->\n' });

    await expect(renderSkillDirectory(skillDir, 'demo', contentDir, context())).rejects.toThrow(
      DirectiveExpansionError,
    );
  });

  // region | Helpers

  function context(overrides: Partial<SkillDeployContext> = {}): SkillDeployContext {
    return {
      toolMapping: TOOL_MAPPING,
      pathPrefix: '.claude/skills',
      homeDir: '.claude',
      harnessId: 'claude',
      skillSigil: '/',
      subagentSigil: '',
      ...overrides,
    };
  }

  /** Returns the transformed content of the markdown entry at relPath, failing if it is absent or an asset. */
  function markdownContent(entries: ReadonlyArray<RenderedSkillEntry>, relPath: string): string {
    const entry = entries.find((candidate) => candidate.relPath === relPath);
    if (entry?.kind !== 'markdown') {
      throw new Error(`Expected a markdown entry at ${relPath}, got ${entry?.kind ?? 'nothing'}`);
    }
    return entry.content;
  }

  /** Writes files into the demo skill directory from a relative-path → content map. */
  async function writeSkill(files: Record<string, string>): Promise<void> {
    for (const [rel, content] of Object.entries(files)) {
      const full = path.join(skillDir, rel);
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, content, 'utf8');
    }
  }

  // endregion | Helpers
});
