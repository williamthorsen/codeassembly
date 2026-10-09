import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AMBIENT_CLOSE_MARKER, AMBIENT_OPEN_MARKER } from '../ambient-region.ts';
import { type ContentRootRender, renderContentRoot } from '../render-content-root.ts';

describe(renderContentRoot, () => {
  let root: string;

  beforeEach(async () => {
    const base = path.join(tmpdir(), `agents-test-render-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    root = path.join(base, 'root');
    await mkdir(root, { recursive: true });
  });

  afterEach(async () => {
    await rm(path.dirname(root), { recursive: true, force: true });
  });

  it('places each artifact at the path where a harness home receives it', async () => {
    await writeFileAt(root, 'skills/alpha/SKILL.md', '---\nname: alpha\ndescription: Alpha.\n---\n\n# Alpha\n');
    await writeFileAt(root, 'skills/alpha/notes.txt', 'plain text\n');
    await writeFileAt(root, 'subagents/helper.md', '---\nname: helper\ndescription: Helper.\n---\n\n# Helper\n');
    await writeFileAt(root, 'skills/_data/reference.md', '# Reference\n');
    await writeRulebook(root, 'house-style', 'skill');

    const claude = indexByPath(await renderContentRoot(root, 'claude'));
    const rovo = indexByPath(await renderContentRoot(root, 'rovo'));

    expect(claude.keys().toArray().toSorted()).toEqual([
      'agents/helper.md',
      'skills/_sources/root/_data/reference.md',
      'skills/alpha/SKILL.md',
      'skills/alpha/notes.txt',
      'skills/consult-house-style/SKILL.md',
    ]);
    expect(rovo.has('subagents/helper.md')).toBe(true);
    expect(claude.get('skills/alpha/notes.txt')).toBe('plain text\n');
  });

  it('stamps the markers that deployment writes', async () => {
    await writeFileAt(root, 'skills/alpha/SKILL.md', '---\nname: alpha\ndescription: Alpha.\n---\n\n# Alpha\n');
    await writeFileAt(root, 'subagents/helper.md', '---\nname: helper\ndescription: Helper.\n---\n\n# Helper\n');
    await writeFileAt(root, 'skills/_data/reference.md', '# Reference\n');
    await writeRulebook(root, 'house-style', 'skill');

    const files = indexByPath(await renderContentRoot(root, 'claude'));

    expect(files.get('skills/alpha/SKILL.md')).toContain('<!-- codeassembly-skill:alpha -->');
    expect(files.get('agents/helper.md')).toContain('<!-- codeassembly-subagent:helper -->');
    expect(files.get('skills/consult-house-style/SKILL.md')).toContain('<!-- codeassembly-rulebook:house-style -->');
    // `sync` delivers a source's support entries without a provenance marker.
    expect(files.get('skills/_sources/root/_data/reference.md')).toBe('# Reference\n');
  });

  it('strips the supported-harnesses directive and leaves a skill out of a harness that it does not target', async () => {
    await writeFileAt(
      root,
      'skills/alpha/SKILL.md',
      '---\nname: alpha\ndescription: Alpha.\nsupported-harnesses:\n  - rovo\n---\n\n# Alpha\n',
    );

    const claude = indexByPath(await renderContentRoot(root, 'claude'));
    const rovo = indexByPath(await renderContentRoot(root, 'rovo'));

    expect(claude.has('skills/alpha/SKILL.md')).toBe(false);
    expect(rovo.get('skills/alpha/SKILL.md')).not.toContain('supported-harnesses');
  });

  it("renders the guidance file with the root's ambient rulebooks inside its ambient region", async () => {
    await writeFileAt(
      root,
      'guidance/_harnesses/claude/CLAUDE.md',
      ['Read {harness_guidance_file}.', '', AMBIENT_OPEN_MARKER, AMBIENT_CLOSE_MARKER, ''].join('\n'),
    );
    await writeRulebook(root, 'house-style', 'ambient', 'Use plain words.');

    const files = indexByPath(await renderContentRoot(root, 'claude'));
    const guidance = files.get('CLAUDE.md') ?? '';

    expect(guidance).toContain('Read CLAUDE.md.');
    expect(guidance).toMatch(/^<!-- GENERATED FILE/);
    const region = guidance.slice(guidance.indexOf(AMBIENT_OPEN_MARKER), guidance.indexOf(AMBIENT_CLOSE_MARKER));
    expect(region).toContain('<!-- rulebook:house-style -->');
    expect(region).toContain('Use plain words.');
  });

  it('fills a declared guidance hook with the rulebooks bound to it', async () => {
    await writeFileAt(
      root,
      'skills/alpha/SKILL.md',
      '---\nname: alpha\ndescription: Alpha.\n---\n\n# Alpha\n\n<!-- guidance-hook: style -->\n',
    );
    await writeRulebook(root, 'house-style', 'hook', 'Use plain words.');

    const bound = indexByPath(await renderContentRoot(root, 'claude', new Map([['style', ['house-style']]])));
    const unbound = indexByPath(await renderContentRoot(root, 'claude'));

    expect(bound.get('skills/alpha/SKILL.md')).toContain('<!-- codeassembly-guidance-hook:style:start -->');
    expect(bound.get('skills/alpha/SKILL.md')).toContain('Use plain words.');
    expect(unbound.get('skills/alpha/SKILL.md')).not.toContain('guidance-hook');
  });

  it('leaves a rulebook out of every delivery mode on a harness that it excludes', async () => {
    for (const harnessId of ['claude', 'rovo']) {
      const fileName = harnessId === 'claude' ? 'CLAUDE.md' : 'AGENTS.md';
      await writeFileAt(
        root,
        `guidance/_harnesses/${harnessId}/${fileName}`,
        ['# Guidance', '', AMBIENT_OPEN_MARKER, AMBIENT_CLOSE_MARKER, ''].join('\n'),
      );
    }
    await writeFileAt(
      root,
      'skills/alpha/SKILL.md',
      '---\nname: alpha\ndescription: Alpha.\n---\n\n# Alpha\n\n<!-- guidance-hook: models -->\n',
    );
    await writeRulebook(
      root,
      'claude-models',
      '[ambient, hook, skill]\nsupported-harnesses: claude',
      'Use the latest model.',
    );
    const bindings = new Map([['models', ['claude-models']]]);

    const claude = indexByPath(await renderContentRoot(root, 'claude', bindings));
    const rovo = indexByPath(await renderContentRoot(root, 'rovo', bindings));

    expect(claude.has('skills/consult-claude-models/SKILL.md')).toBe(true);
    expect(claude.get('CLAUDE.md')).toContain('Use the latest model.');
    expect(claude.get('skills/alpha/SKILL.md')).toContain('Use the latest model.');
    expect(rovo.has('skills/consult-claude-models/SKILL.md')).toBe(false);
    expect(rovo.get('AGENTS.md')).not.toContain('Use the latest model.');
    expect(rovo.get('skills/alpha/SKILL.md')).not.toContain('Use the latest model.');
  });

  it('rejects a token that names a rulebook excluding the harness of the body that contains it', async () => {
    await writeRulebook(root, 'claude-models', 'skill\nsupported-harnesses: claude');
    await writeRulebook(root, 'dispatch', 'skill', 'See {rulebook:claude-models}.');

    const claude = await renderContentRoot(root, 'claude');
    const rovo = await renderContentRoot(root, 'rovo');

    expect(claude.failures).toEqual([]);
    expect(rovo.failures).toEqual([
      {
        file: 'guidance/rulebooks/dispatch.md',
        error: expect.objectContaining({ message: expect.stringContaining('deploys only to claude') }),
      },
    ]);
  });

  it('reports a binding to a rulebook that the root does not contain as a defect', async () => {
    await writeFileAt(
      root,
      'skills/alpha/SKILL.md',
      '---\nname: alpha\ndescription: Alpha.\n---\n\n# Alpha\n\n<!-- guidance-hook: style -->\n',
    );

    const render = await renderContentRoot(root, 'claude', new Map([['style', ['absent-style']]]));

    expect(render.defects).toEqual([expect.objectContaining({ detail: expect.stringContaining('absent-style') })]);
  });

  it("anchors a skill's link to a support entry in the root's support namespace", async () => {
    await writeFileAt(
      root,
      'skills/alpha/SKILL.md',
      '---\nname: alpha\ndescription: Alpha.\n---\n\n# Alpha\n\nSee [the reference](../_data/reference.md).\n',
    );
    await writeFileAt(root, 'skills/_data/reference.md', '# Reference\n');

    const files = indexByPath(await renderContentRoot(root, 'claude'));

    expect(files.get('skills/alpha/SKILL.md')).toContain('(~/.claude/skills/_sources/root/_data/reference.md)');
  });

  it('records a failing file against its path and renders the rest', async () => {
    await writeFileAt(
      root,
      'skills/alpha/SKILL.md',
      '---\nname: alpha\ndescription: Alpha.\n---\n\nRun {tool:Nope}.\n',
    );
    await writeFileAt(root, 'subagents/helper.md', '---\nname: helper\ndescription: Helper.\n---\n\n# Helper\n');

    const render = await renderContentRoot(root, 'claude');

    expect(render.failures.map(({ file }) => file)).toEqual([path.join('skills', 'alpha', 'SKILL.md')]);
    expect(indexByPath(render).has('agents/helper.md')).toBe(true);
  });

  it('reports an edge that resolves nowhere as a defect rather than a render failure', async () => {
    await writeFileAt(
      root,
      'skills/alpha/SKILL.md',
      '---\nname: alpha\ndescription: Alpha.\ndependencies:\n  skills:\n    - missing\n---\n\n# Alpha\n',
    );

    const render = await renderContentRoot(root, 'claude');

    expect(render.defects).toEqual([expect.objectContaining({ kind: 'dependency' })]);
  });
});

// region | Helpers

/** Maps each rendered file's path to its content. */
function indexByPath(render: ContentRootRender): ReadonlyMap<string, string> {
  return new Map(render.files.map((file) => [file.path, file.content]));
}

/** Writes `content` at `relPath` under `root`, creating its directories. */
async function writeFileAt(root: string, relPath: string, content: string): Promise<void> {
  const filePath = path.join(root, relPath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, 'utf8');
}

/** Writes a rulebook delivered through `delivery`. */
async function writeRulebook(root: string, slug: string, delivery: string, body = 'Body.'): Promise<void> {
  await writeFileAt(
    root,
    `guidance/rulebooks/${slug}.md`,
    `---\nslug: ${slug}\ndescription: ${slug} fixture rulebook\ndelivery: ${delivery}\n---\n\n# ${slug}\n\n${body}\n`,
  );
}

// endregion | Helpers
