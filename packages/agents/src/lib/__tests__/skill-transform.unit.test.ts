import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DirectiveExpansionError } from '../directive-expander.ts';
import { GuidanceHookError } from '../guidance-hooks.ts';
import type { RulebookInvocationCatalog } from '../invocation-tokens.ts';
import { homeAnchor } from '../path-rewriter.ts';
import {
  type RenderedSkillEntry,
  renderSkillDirectory,
  renderSupportEntry,
  type SkillDeployContext,
} from '../skill-transform.ts';
import { ToolNameRewriteError } from '../tool-name-rewriter.ts';

const TOOL_MAPPING = new Map([['Read', 'open_files']]);

// `shell-conventions` carries a `skill-name` override, so its deployed name is not `consult-<slug>`.
const RULEBOOKS: RulebookInvocationCatalog = new Map([
  ['nmr-cheatsheet', { skillName: 'consult-nmr-cheatsheet', skill: false }],
  ['nmr-scripts', { skillName: 'consult-nmr-scripts', skill: true }],
  ['shell-conventions', { skillName: 'shell-rules', skill: true }],
]);

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

    const entries = await renderSkillDirectory(skillDir, 'demo', contentDir, buildContext());

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

    const claude = markdownContent(
      await renderSkillDirectory(skillDir, 'demo', contentDir, buildContext()),
      'SKILL.md',
    );
    expect(claude).toContain('Dispatch code-reviewer.');
    expect(claude).toContain('Then invoke /capture-event.');
    expect(claude).not.toContain('{skill:');
    expect(claude).not.toContain('{subagent:');

    const rovo = markdownContent(
      await renderSkillDirectory(skillDir, 'demo', contentDir, buildContext({ skillSigil: '!' })),
      'SKILL.md',
    );
    expect(rovo).toContain('Then invoke !capture-event.');
  });

  it('renders a rulebook token as the deploy name its target takes, including from an included partial', async () => {
    await writeSkill({
      'SKILL.md': '# Demo\n\nSee {rulebook:shell-conventions}.\n\n<!-- include: _partials/frag.md / -->\n',
      '_partials/frag.md': 'Also see {rulebook:nmr-scripts}.\n',
    });

    const content = markdownContent(
      await renderSkillDirectory(skillDir, 'demo', contentDir, buildContext({ rulebooks: RULEBOOKS })),
      'SKILL.md',
    );

    expect(content).toContain('See /shell-rules.');
    expect(content).toContain('Also see /consult-nmr-scripts.');
  });

  it('throws when a skill body names a rulebook that deploys no skill to invoke', async () => {
    await writeSkill({ 'SKILL.md': '# Demo\n\nSee {rulebook:nmr-cheatsheet}.\n' });

    await expect(
      renderSkillDirectory(skillDir, 'demo', contentDir, buildContext({ rulebooks: RULEBOOKS })),
    ).rejects.toThrow(/names an ambient-only rulebook/);
  });

  it('rewrites a bare-relative link in a nested .md against the skill slug and prefix', async () => {
    await writeSkill({ 'SKILL.md': '# Demo\n', 'reference/guide.md': 'See [the data](../data/table.csv).\n' });

    const entries = await renderSkillDirectory(skillDir, 'demo', contentDir, buildContext());

    expect(markdownContent(entries, 'reference/guide.md')).toContain(
      '[the data](~/.claude/skills/demo/data/table.csv)',
    );
  });

  it('collects nothing from a skill-nested test directory, at any depth', async () => {
    await writeSkill({
      'SKILL.md': '# Demo\n',
      '__tests__/demo.unit.test.ts': 'export {};\n',
      '__tests__/fixtures/sample.md': '# Sample\n',
      'reference/__tests__/nested.md': '# Nested\n',
    });

    const entries = await renderSkillDirectory(skillDir, 'demo', contentDir, buildContext());

    expect(entries.map((entry) => entry.relPath)).toEqual(['SKILL.md']);
  });

  it('returns non-.md files as assets pointing at the source path', async () => {
    await writeSkill({ 'SKILL.md': '# Demo\n', 'data/table.csv': 'a,b\n1,2\n' });

    const entries = await renderSkillDirectory(skillDir, 'demo', contentDir, buildContext());

    expect(entries.find((entry) => entry.relPath === 'data/table.csv')).toEqual({
      kind: 'asset',
      relPath: 'data/table.csv',
      srcPath: path.join(skillDir, 'data', 'table.csv'),
    });
  });

  it('throws a file/line-anchored error for an unmapped tool placeholder', async () => {
    await writeSkill({ 'SKILL.md': '# Demo\n\nUse {tool:Bash}.\n' });

    await expect(renderSkillDirectory(skillDir, 'demo', contentDir, buildContext())).rejects.toThrow(
      ToolNameRewriteError,
    );
    await expect(renderSkillDirectory(skillDir, 'demo', contentDir, buildContext())).rejects.toThrow(
      /skills\/demo\/SKILL\.md:3/,
    );
  });

  it('throws a source-labelled error for an anchor naming no heading in the same file', async () => {
    await writeSkill({ 'SKILL.md': '# Demo\n\nSee [the events](#lifecycle-events).\n' });

    await expect(renderSkillDirectory(skillDir, 'demo', contentDir, buildContext())).rejects.toThrow(
      /skills\/demo\/SKILL\.md carries 1 unresolvable anchor link target/,
    );
  });

  it('resolves an anchor against a heading the include expansion brought in', async () => {
    await writeSkill({
      'SKILL.md': '# Demo\n\nSee [the events](#lifecycle-events).\n\n<!-- include: _partials/events.md / -->\n',
      '_partials/events.md': '## Lifecycle events\n',
    });

    await expect(renderSkillDirectory(skillDir, 'demo', contentDir, buildContext())).resolves.toBeDefined();
  });

  it('rejects an anchor to the rendered slug of a heading carrying a tool placeholder', async () => {
    // The heading slugs differently on each harness, so no single fragment addresses it. Checking ahead of the
    // rewrite is what makes that unauthorable rather than live on one harness and dead on the other.
    await writeSkill({ 'SKILL.md': '# Demo\n\n## {tool:Read} return parsing\n\n[x](#read-return-parsing)\n' });

    await expect(renderSkillDirectory(skillDir, 'demo', contentDir, buildContext())).rejects.toThrow(
      /#read-return-parsing -- names no heading/,
    );
  });

  it('throws on a broken include directive', async () => {
    await writeSkill({ 'SKILL.md': '# Demo\n\n<!-- include: _partials/missing.md / -->\n' });

    await expect(renderSkillDirectory(skillDir, 'demo', contentDir, buildContext())).rejects.toThrow(
      DirectiveExpansionError,
    );
  });

  it('strips a declared guidance hook from every .md the skill deploys', async () => {
    await writeSkill({
      'SKILL.md': '# Demo\n\n<!-- guidance-hook: implementation-preferences -->\n\nProse.\n',
      'reference/guide.md': '<!-- guidance-hook: glossary -->\nGuide.\n',
    });

    const entries = await renderSkillDirectory(skillDir, 'demo', contentDir, buildContext());

    expect(markdownContent(entries, 'SKILL.md')).toBe('# Demo\n\n\nProse.\n');
    expect(markdownContent(entries, 'reference/guide.md')).toBe('Guide.\n');
  });

  it('strips a guidance hook an included partial declares', async () => {
    await writeSkill({
      'SKILL.md': '# Demo\n\n<!-- include: _partials/hook.md / -->\n\nProse.\n',
      '_partials/hook.md': '<!-- guidance-hook: implementation-preferences -->\n',
    });

    const content = markdownContent(
      await renderSkillDirectory(skillDir, 'demo', contentDir, buildContext()),
      'SKILL.md',
    );

    expect(content).not.toContain('guidance-hook');
    expect(content).toBe('# Demo\n\n\nProse.\n');
  });

  it('rejects a hook the host and an included partial both declare', async () => {
    // Expansion runs first, so the partial's declaration is the host's own: two slots of one name, no fill order.
    await writeSkill({
      'SKILL.md': '# Demo\n\n<!-- guidance-hook: preferences -->\n\n<!-- include: _partials/hook.md / -->\n',
      '_partials/hook.md': '<!-- guidance-hook: preferences -->\n',
    });

    await expect(renderSkillDirectory(skillDir, 'demo', contentDir, buildContext())).rejects.toThrow(
      /skills\/demo\/SKILL\.md:5 name="preferences" firstDeclaredAt=3 reason=duplicate-hook/,
    );
  });

  it('rejects a malformed hook name', async () => {
    await writeSkill({ 'SKILL.md': '# Demo\n\n<!-- guidance-hook: Mixed-Case -->\n' });

    await expect(renderSkillDirectory(skillDir, 'demo', contentDir, buildContext())).rejects.toThrow(GuidanceHookError);
  });

  it('fills a declared guidance hook with the guidance bound to it', async () => {
    await writeSkill({ 'SKILL.md': '# Demo\n\n<!-- guidance-hook: impl -->\n\nProse.\n' });

    const fills = new Map([['impl', [{ slug: 'layout', body: '# Layout\n\nGroup source by role.\n' }]]]);
    const content = markdownContent(
      await renderSkillDirectory(skillDir, 'demo', contentDir, buildContext({ guidanceHookFills: fills })),
      'SKILL.md',
    );

    expect(content).toContain('<!-- codeassembly-guidance-hook:impl:start -->');
    expect(content).toContain('<!-- rulebook:layout -->');
    expect(content).toContain('## Layout');
    expect(content).toContain('Group source by role.');
  });

  it("leaves a bound body's rendered links and tokens untouched by the host rewrites", async () => {
    await writeSkill({ 'SKILL.md': '<!-- guidance-hook: impl -->\n' });

    const fills = new Map([
      ['impl', [{ slug: 'layout', body: 'See [naming](~/.claude/skills/_data/naming.md) under `~/.claude`.\n' }]],
    ]);
    const content = markdownContent(
      await renderSkillDirectory(skillDir, 'demo', contentDir, buildContext({ guidanceHookFills: fills })),
      'SKILL.md',
    );

    expect(content).toContain('[naming](~/.claude/skills/_data/naming.md)');
  });

  it('fills a hook an included partial declares', async () => {
    await writeSkill({
      'SKILL.md': '# Demo\n\n<!-- include: _partials/hook.md / -->\n',
      '_partials/hook.md': '<!-- guidance-hook: impl -->\n',
    });

    const fills = new Map([['impl', [{ slug: 'layout', body: 'Bound guidance.\n' }]]]);
    const content = markdownContent(
      await renderSkillDirectory(skillDir, 'demo', contentDir, buildContext({ guidanceHookFills: fills })),
      'SKILL.md',
    );

    expect(content).toContain('Bound guidance.');
  });

  it('strips a hook no binding names, even when other hooks are bound', async () => {
    await writeSkill({ 'SKILL.md': '# Demo\n\n<!-- guidance-hook: glossary -->\n' });

    const fills = new Map([['impl', [{ slug: 'layout', body: 'Bound guidance.\n' }]]]);
    const content = markdownContent(
      await renderSkillDirectory(skillDir, 'demo', contentDir, buildContext({ guidanceHookFills: fills })),
      'SKILL.md',
    );

    expect(content).not.toContain('guidance-hook');
    expect(content).not.toContain('Bound guidance.');
  });

  // region | Helpers

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

describe(renderSupportEntry, () => {
  let contentDir: string;
  let skillsDir: string;

  beforeEach(async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    contentDir = path.join(tmpdir(), `agents-test-support-${stamp}`);
    skillsDir = path.join(contentDir, 'skills');
    await mkdir(skillsDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(contentDir, { recursive: true, force: true });
  });

  it('strips a declared guidance hook from a Markdown file support entry', async () => {
    const srcPath = path.join(skillsDir, 'table.md');
    await writeFile(srcPath, '# Table\n\n<!-- guidance-hook: implementation-preferences -->\n\nRows.\n', 'utf8');

    const rendered = await renderSupportEntry(srcPath, 'table.md', contentDir, buildContext());

    expect(rendered).toEqual({ kind: 'markdown', content: '# Table\n\n\nRows.\n' });
  });

  it("strips a support entry's hook even when the caller carries a binding for it", async () => {
    const srcPath = path.join(skillsDir, 'table.md');
    await writeFile(srcPath, '# Table\n\n<!-- guidance-hook: impl -->\n\nRows.\n', 'utf8');

    const rendered = await renderSupportEntry(
      srcPath,
      'table.md',
      contentDir,
      buildContext({ guidanceHookFills: new Map([['impl', [{ slug: 'layout', body: 'Bound guidance.\n' }]]]) }),
    );

    expect(rendered).toEqual({ kind: 'markdown', content: '# Table\n\n\nRows.\n' });
  });

  it('rejects a rulebook token even when the caller carries a catalog', async () => {
    // `install` ships a support entry having resolved no declaration, so honoring the token here would pass a gate the
    // ship then fails.
    const srcPath = path.join(skillsDir, 'table.md');
    await writeFile(srcPath, '# Table\n\nSee {rulebook:nmr-scripts}.\n', 'utf8');

    await expect(
      renderSupportEntry(srcPath, 'table.md', contentDir, buildContext({ rulebooks: RULEBOOKS })),
    ).rejects.toThrow(/a support entry under skills\/ renders without one/);
  });

  it('rewrites links, invocation tokens, and template variables in a Markdown file support entry', async () => {
    const srcPath = path.join(skillsDir, 'glossary.md');
    await writeFile(
      srcPath,
      'See [the table](_data/table.md), run {skill:commit} on {harness_id}, then `{harness_home_dir}/scripts/x.sh`.\n',
      'utf8',
    );

    const rendered = await renderSupportEntry(srcPath, 'glossary.md', contentDir, buildContext());

    expect(rendered).toEqual({
      kind: 'markdown',
      content:
        'See [the table](~/.claude/skills/_data/table.md), run /commit on claude, then `~/.claude/scripts/x.sh`.\n',
    });
  });

  it("strips a hook in a support directory's entries, the route that renders through the skill transform", async () => {
    const srcDir = path.join(skillsDir, '_data');
    await mkdir(srcDir, { recursive: true });
    await writeFile(path.join(srcDir, 'table.md'), '# Table\n\n<!-- guidance-hook: impl -->\n\nRows.\n', 'utf8');

    const rendered = await renderSupportEntry(
      srcDir,
      '_data',
      contentDir,
      buildContext({ guidanceHookFills: new Map([['impl', [{ slug: 'layout', body: 'Bound guidance.\n' }]]]) }),
    );

    expect(rendered).toEqual({
      kind: 'directory',
      entries: [{ kind: 'markdown', relPath: 'table.md', content: '# Table\n\n\nRows.\n' }],
    });
  });
});

// region | Helpers

/** Builds a deploy context targeting the Claude harness, with `overrides` applied over its defaults. */
function buildContext(overrides: Partial<SkillDeployContext> = {}): SkillDeployContext {
  return {
    toolMapping: TOOL_MAPPING,
    anchor: homeAnchor('.claude/skills'),
    guidanceFileName: 'CLAUDE.md',
    homeDir: '.claude',
    harnessId: 'claude',
    skillSigil: '/',
    subagentSigil: '',
    ...overrides,
  };
}

// endregion | Helpers
