import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { mergeFrontmatter } from '../frontmatter-merger.ts';
import { HARNESSES } from '../harness.ts';
import { rewriteMarkdownPaths, rewriteTemplateVariables } from '../path-rewriter.ts';
import { loadSubagentOverlay, renderSubagentForHarness } from '../subagent-transform.ts';
import { loadToolMapping, rewriteToolNames, ToolNameRewriteError } from '../tool-name-rewriter.ts';

const SOURCE = [
  '---',
  'name: demo-agent',
  'description: Demo subagent',
  '---',
  '',
  '# Demo agent',
  '',
  'Use the {tool:Read} tool, then run `{harness_home_dir}/scripts/demo.sh`.',
  '',
  'See [the guide](./guide.md).',
  '',
].join('\n');

const CLAUDE_OVERLAY = ['_tools:', '  Read: Read', '', '_defaults:', '  permissionMode: bypassPermissions', ''].join(
  '\n',
);
const ROVODEV_OVERLAY = ['_tools:', '  Read: open_files', '', '_defaults:', '  tools: [bash, open_files]', ''].join(
  '\n',
);

describe(renderSubagentForHarness, () => {
  it('merges _defaults, rewrites the tool placeholder, and expands {harness_home_dir} for claude', () => {
    const output = renderSubagentForHarness(SOURCE, {
      overlayYaml: CLAUDE_OVERLAY,
      toolMapping: loadToolMapping(CLAUDE_OVERLAY),
      fileRelPath: 'demo-agent.md',
      sourceLabel: 'subagents/demo-agent.md',
      pathPrefix: '.claude',
      homeDir: '.claude',
      harnessId: 'claude',
    });

    expect(output).toContain('permissionMode: bypassPermissions');
    expect(output).toContain('Use the Read tool');
    expect(output).toContain('~/.claude/scripts/demo.sh');
    expect(output).not.toContain('{harness_home_dir}');
    expect(output).not.toContain('{tool:Read}');
  });

  it('applies the harness-native tool name and home dir for rovodev', () => {
    const output = renderSubagentForHarness(SOURCE, {
      overlayYaml: ROVODEV_OVERLAY,
      toolMapping: loadToolMapping(ROVODEV_OVERLAY),
      fileRelPath: 'demo-agent.md',
      sourceLabel: 'subagents/demo-agent.md',
      pathPrefix: '.rovodev',
      homeDir: '.rovodev',
      harnessId: 'rovodev',
    });

    expect(output).toContain('tools: [bash, open_files]');
    expect(output).toContain('Use the open_files tool');
    expect(output).toContain('~/.rovodev/scripts/demo.sh');
  });

  it('rewrites a relative Markdown link to a tilde-prefixed path under pathPrefix', () => {
    const output = renderSubagentForHarness(SOURCE, {
      overlayYaml: CLAUDE_OVERLAY,
      toolMapping: loadToolMapping(CLAUDE_OVERLAY),
      fileRelPath: 'demo-agent.md',
      sourceLabel: 'subagents/demo-agent.md',
      pathPrefix: '.claude',
      homeDir: '.claude',
      harnessId: 'claude',
    });

    expect(output).toContain('[the guide](~/.claude/guide.md)');
  });

  it('throws ToolNameRewriteError when a placeholder has no overlay mapping', () => {
    expect(() =>
      renderSubagentForHarness(SOURCE, {
        overlayYaml: '_tools: {}\n',
        toolMapping: loadToolMapping('_tools: {}\n'),
        fileRelPath: 'demo-agent.md',
        sourceLabel: 'subagents/demo-agent.md',
        pathPrefix: '.claude',
        homeDir: '.claude',
        harnessId: 'claude',
      }),
    ).toThrow(ToolNameRewriteError);
  });

  it('produces the same output as the standalone merge → tools → markdown-path → template steps', () => {
    const toolMapping = loadToolMapping(CLAUDE_OVERLAY);
    const merged = mergeFrontmatter(SOURCE, CLAUDE_OVERLAY);
    const rewrittenTools = rewriteToolNames(merged, toolMapping, 'subagents/demo-agent.md');
    const rewrittenPaths = rewriteMarkdownPaths(rewrittenTools, 'demo-agent.md', '.claude');
    const expected = rewriteTemplateVariables(rewrittenPaths, '.claude', 'claude');

    const rendered = renderSubagentForHarness(SOURCE, {
      overlayYaml: CLAUDE_OVERLAY,
      toolMapping,
      fileRelPath: 'demo-agent.md',
      sourceLabel: 'subagents/demo-agent.md',
      pathPrefix: '.claude',
      homeDir: '.claude',
      harnessId: 'claude',
    });

    expect(rendered).toBe(expected);
  });
});

describe(loadSubagentOverlay, () => {
  let contentDir: string;

  beforeEach(async () => {
    contentDir = path.join(tmpdir(), `agents-test-overlay-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(path.join(contentDir, 'subagents', '_data'), { recursive: true });
  });

  afterEach(async () => {
    await rm(contentDir, { recursive: true, force: true });
  });

  it('reads the harness overlay file from subagents/_data', async () => {
    await writeFile(path.join(contentDir, 'subagents', '_data', 'claude.yaml'), CLAUDE_OVERLAY, 'utf8');

    expect(await loadSubagentOverlay(contentDir, HARNESSES.claude)).toBe(CLAUDE_OVERLAY);
  });

  it('returns an empty string when the overlay file is absent', async () => {
    expect(await loadSubagentOverlay(contentDir, HARNESSES.rovodev)).toBe('');
  });
});
