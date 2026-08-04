import { unindent } from '@williamthorsen/toolbelt.strings/candidate';
import { describe, expect, it } from 'vitest';

import { mergeFrontmatter } from '../frontmatter-merger.ts';
import { rewriteInvocationTokens } from '../invocation-tokens.ts';
import { homeAnchor, rewriteMarkdownPaths, rewriteTemplateVariables } from '../path-rewriter.ts';
import { renderSubagentForHarness } from '../subagent-transform.ts';
import { loadToolMapping, rewriteToolNames, ToolNameRewriteError } from '../tool-name-rewriter.ts';

const SOURCE = unindent`
  ---
  name: demo-agent
  description: Demo subagent
  ---

  # Demo agent

  Use the {tool:Read} tool, then run \`{harness_home_dir}/scripts/demo.sh\`.

  See [the guide](./guide.md).

`;

const CLAUDE_OVERLAY = unindent`
  _tools:
    Read: Read

  _defaults:
    permissionMode: bypassPermissions

`;
const ROVO_OVERLAY = unindent`
  _tools:
    Read: open_files

  _defaults:
    tools: [bash, open_files]

`;

describe(renderSubagentForHarness, () => {
  it('merges _defaults, rewrites the tool placeholder, and expands {harness_home_dir} for claude', () => {
    const output = renderSubagentForHarness(SOURCE, {
      overlayYaml: CLAUDE_OVERLAY,
      toolMapping: loadToolMapping(CLAUDE_OVERLAY),
      fileRelPath: 'demo-agent.md',
      sourceLabel: 'subagents/demo-agent.md',
      anchor: homeAnchor('.claude'),
      homeDir: '.claude',
      harnessId: 'claude',
      skillSigil: '/',
      subagentSigil: '',
    });

    expect(output).toContain('permissionMode: bypassPermissions');
    expect(output).toContain('Use the Read tool');
    expect(output).toContain('~/.claude/scripts/demo.sh');
    expect(output).not.toContain('{harness_home_dir}');
    expect(output).not.toContain('{tool:Read}');
  });

  it('applies the harness-native tool name and home dir for rovodev', () => {
    const output = renderSubagentForHarness(SOURCE, {
      overlayYaml: ROVO_OVERLAY,
      toolMapping: loadToolMapping(ROVO_OVERLAY),
      fileRelPath: 'demo-agent.md',
      sourceLabel: 'subagents/demo-agent.md',
      anchor: homeAnchor('.rovodev'),
      homeDir: '.rovodev',
      harnessId: 'rovodev',
      skillSigil: '!',
      subagentSigil: '',
    });

    expect(output).toContain('tools: [bash, open_files]');
    expect(output).toContain('Use the open_files tool');
    expect(output).toContain('~/.rovodev/scripts/demo.sh');
  });

  it('rewrites skill and subagent invocation tokens to their harness-rendered form', () => {
    const source = unindent`
      ---
      name: demo-agent
      description: Demo subagent
      ---

      Invoke {skill:capture-event}, then dispatch {subagent:code-reviewer}.

    `;

    const claude = renderSubagentForHarness(source, {
      overlayYaml: CLAUDE_OVERLAY,
      toolMapping: loadToolMapping(CLAUDE_OVERLAY),
      fileRelPath: 'demo-agent.md',
      sourceLabel: 'subagents/demo-agent.md',
      anchor: homeAnchor('.claude'),
      homeDir: '.claude',
      harnessId: 'claude',
      skillSigil: '/',
      subagentSigil: '',
    });
    expect(claude).toContain('Invoke /capture-event, then dispatch code-reviewer.');
    expect(claude).not.toContain('{skill:');
    expect(claude).not.toContain('{subagent:');

    const rovo = renderSubagentForHarness(source, {
      overlayYaml: ROVO_OVERLAY,
      toolMapping: loadToolMapping(ROVO_OVERLAY),
      fileRelPath: 'demo-agent.md',
      sourceLabel: 'subagents/demo-agent.md',
      anchor: homeAnchor('.rovodev'),
      homeDir: '.rovodev',
      harnessId: 'rovodev',
      skillSigil: '!',
      subagentSigil: '',
    });
    expect(rovo).toContain('Invoke !capture-event, then dispatch code-reviewer.');
  });

  it('rewrites a relative Markdown link to the path its anchor names', () => {
    const output = renderSubagentForHarness(SOURCE, {
      overlayYaml: CLAUDE_OVERLAY,
      toolMapping: loadToolMapping(CLAUDE_OVERLAY),
      fileRelPath: 'demo-agent.md',
      sourceLabel: 'subagents/demo-agent.md',
      anchor: homeAnchor('.claude'),
      homeDir: '.claude',
      harnessId: 'claude',
      skillSigil: '/',
      subagentSigil: '',
    });

    expect(output).toContain('[the guide](~/.claude/guide.md)');
  });

  it('strips a declared guidance hook from the deployed body', () => {
    const source = `${SOURCE}<!-- guidance-hook: implementation-preferences -->\n\nTail prose.\n`;

    const output = renderSubagentForHarness(source, {
      overlayYaml: CLAUDE_OVERLAY,
      toolMapping: loadToolMapping(CLAUDE_OVERLAY),
      fileRelPath: 'demo-agent.md',
      sourceLabel: 'subagents/demo-agent.md',
      anchor: homeAnchor('.claude'),
      homeDir: '.claude',
      harnessId: 'claude',
      skillSigil: '/',
      subagentSigil: '',
    });

    expect(output).not.toContain('guidance-hook');
    expect(output).toContain('Tail prose.');
  });

  it('throws a source-labelled error for a hook declared twice in one body', () => {
    const source = `${SOURCE}<!-- guidance-hook: preferences -->\n<!-- guidance-hook: preferences -->\n`;

    expect(() =>
      renderSubagentForHarness(source, {
        overlayYaml: CLAUDE_OVERLAY,
        toolMapping: loadToolMapping(CLAUDE_OVERLAY),
        fileRelPath: 'demo-agent.md',
        sourceLabel: 'subagents/demo-agent.md',
        anchor: homeAnchor('.claude'),
        homeDir: '.claude',
        harnessId: 'claude',
        skillSigil: '/',
        subagentSigil: '',
      }),
    ).toThrow(/subagents\/demo-agent\.md:\d+ name="preferences" .* reason=duplicate-hook/);
  });

  it('throws a source-labelled error for an anchor naming no heading in the same body', () => {
    const source = `${SOURCE}See [the findings](#finding-scheme).\n`;

    expect(() =>
      renderSubagentForHarness(source, {
        overlayYaml: CLAUDE_OVERLAY,
        toolMapping: loadToolMapping(CLAUDE_OVERLAY),
        fileRelPath: 'demo-agent.md',
        sourceLabel: 'subagents/demo-agent.md',
        anchor: homeAnchor('.claude'),
        homeDir: '.claude',
        harnessId: 'claude',
        skillSigil: '/',
        subagentSigil: '',
      }),
    ).toThrow(/subagents\/demo-agent\.md carries 1 unresolvable anchor link target/);
  });

  it('throws ToolNameRewriteError when a placeholder has no overlay mapping', () => {
    expect(() =>
      renderSubagentForHarness(SOURCE, {
        overlayYaml: '_tools: {}\n',
        toolMapping: loadToolMapping('_tools: {}\n'),
        fileRelPath: 'demo-agent.md',
        sourceLabel: 'subagents/demo-agent.md',
        anchor: homeAnchor('.claude'),
        homeDir: '.claude',
        harnessId: 'claude',
        skillSigil: '/',
        subagentSigil: '',
      }),
    ).toThrow(ToolNameRewriteError);
  });

  it.each([
    { harnessId: 'claude', overlayYaml: CLAUDE_OVERLAY, homeDir: '.claude', skillSigil: '/', subagentSigil: '' },
    { harnessId: 'rovodev', overlayYaml: ROVO_OVERLAY, homeDir: '.rovodev', skillSigil: '!', subagentSigil: '' },
  ])(
    'produces the same $harnessId output as the standalone merge → tools → invocations → markdown-path → template steps',
    ({ harnessId, overlayYaml, homeDir, skillSigil, subagentSigil }) => {
      const toolMapping = loadToolMapping(overlayYaml);
      const merged = mergeFrontmatter(SOURCE, overlayYaml);
      const rewrittenTools = rewriteToolNames(merged, toolMapping, 'subagents/demo-agent.md');
      const rewrittenInvocations = rewriteInvocationTokens(
        rewrittenTools,
        { skillSigil, subagentSigil },
        'subagents/demo-agent.md',
      );
      const rewrittenPaths = rewriteMarkdownPaths(rewrittenInvocations, 'demo-agent.md', homeAnchor(homeDir));
      const expected = rewriteTemplateVariables(rewrittenPaths, homeDir, harnessId);

      const rendered = renderSubagentForHarness(SOURCE, {
        overlayYaml,
        toolMapping,
        fileRelPath: 'demo-agent.md',
        sourceLabel: 'subagents/demo-agent.md',
        anchor: homeAnchor(homeDir),
        homeDir,
        harnessId,
        skillSigil,
        subagentSigil,
      });

      expect(rendered).toBe(expected);
    },
  );
});
