import { dedent } from '@williamthorsen/toolbelt.strings/candidate';
import { describe, expect, it } from 'vitest';

import { mergeFrontmatter } from '../frontmatter-merger.ts';
import { HARNESSES } from '../harness.ts';
import { rewriteInvocationTokens, type RulebookInvocationCatalog } from '../invocation-tokens.ts';
import { homeAnchor, rewriteMarkdownPaths, rewriteTemplateVariables } from '../path-rewriter.ts';
import { renderSubagentForHarness } from '../subagent-transform.ts';
import { rewriteToolNames, ToolNameRewriteError } from '../tool-name-rewriter.ts';

const ROVO_HOME = HARNESSES.rovo.homeDir;

/** An empty catalog: no source under test carries a `{rulebook:<slug>}` token, so nothing addresses one. */
const NO_RULEBOOKS: RulebookInvocationCatalog = new Map();

// `shell-conventions` carries a `skill-name` override, so its deployed name is not `consult-<slug>`.
const RULEBOOKS: RulebookInvocationCatalog = new Map([
  ['nmr-cheatsheet', { skillName: 'consult-nmr-cheatsheet', skill: false }],
  ['shell-conventions', { skillName: 'shell-rules', skill: true }],
]);

const SOURCE = dedent`
  ---
  name: demo-agent
  description: Demo subagent
  ---

  # Demo agent

  Use the {tool:Read} tool, then run \`{harness_home_dir}/scripts/demo.sh\`.

  See [the guide](./guide.md).

`;

const CLAUDE_OVERLAY = dedent`
  _defaults:
    permissionMode: bypassPermissions

`;
const ROVO_OVERLAY = dedent`
  _defaults:
    tools: [bash, open_files]

`;

describe(renderSubagentForHarness, () => {
  it('merges _defaults, rewrites the tool placeholder, and expands {harness_home_dir} for claude', () => {
    const output = renderSubagentForHarness(SOURCE, {
      overlayYaml: CLAUDE_OVERLAY,
      fileRelPath: 'demo-agent.md',
      sourceLabel: 'subagents/demo-agent.md',
      anchor: homeAnchor('.claude'),
      guidanceFileName: 'CLAUDE.md',
      homeDir: '.claude',
      harnessId: 'claude',
      skillSigil: '/',
      subagentSigil: '',
      rulebooks: NO_RULEBOOKS,
    });

    expect(output).toContain('permissionMode: bypassPermissions');
    expect(output).toContain('Use the Read tool');
    expect(output).toContain('~/.claude/scripts/demo.sh');
    expect(output).not.toContain('{harness_home_dir}');
    expect(output).not.toContain('{tool:Read}');
  });

  it('applies the harness-native tool name and home dir for rovo', () => {
    const output = renderSubagentForHarness(SOURCE, {
      overlayYaml: ROVO_OVERLAY,
      fileRelPath: 'demo-agent.md',
      sourceLabel: 'subagents/demo-agent.md',
      anchor: homeAnchor(ROVO_HOME),
      guidanceFileName: 'AGENTS.md',
      homeDir: ROVO_HOME,
      harnessId: 'rovo',
      skillSigil: '!',
      subagentSigil: '',
      rulebooks: NO_RULEBOOKS,
    });

    expect(output).toContain('tools: [bash, open_files]');
    expect(output).toContain('Use the open_files tool');
    expect(output).toContain(`~/${ROVO_HOME}/scripts/demo.sh`);
  });

  it('rewrites skill and subagent invocation tokens to their harness-rendered form', () => {
    const source = dedent`
      ---
      name: demo-agent
      description: Demo subagent
      ---

      Invoke {skill:capture-event}, then dispatch {subagent:code-reviewer}.

    `;

    const claude = renderSubagentForHarness(source, {
      overlayYaml: CLAUDE_OVERLAY,
      fileRelPath: 'demo-agent.md',
      sourceLabel: 'subagents/demo-agent.md',
      anchor: homeAnchor('.claude'),
      guidanceFileName: 'CLAUDE.md',
      homeDir: '.claude',
      harnessId: 'claude',
      skillSigil: '/',
      subagentSigil: '',
      rulebooks: NO_RULEBOOKS,
    });
    expect(claude).toContain('Invoke /capture-event, then dispatch code-reviewer.');
    expect(claude).not.toContain('{skill:');
    expect(claude).not.toContain('{subagent:');

    const rovo = renderSubagentForHarness(source, {
      overlayYaml: ROVO_OVERLAY,
      fileRelPath: 'demo-agent.md',
      sourceLabel: 'subagents/demo-agent.md',
      anchor: homeAnchor(ROVO_HOME),
      guidanceFileName: 'AGENTS.md',
      homeDir: ROVO_HOME,
      harnessId: 'rovo',
      skillSigil: '!',
      subagentSigil: '',
      rulebooks: NO_RULEBOOKS,
    });
    expect(rovo).toContain('Invoke !capture-event, then dispatch code-reviewer.');
  });

  it('renders a rulebook token as the deploy name its target takes', () => {
    const source = dedent`
      ---
      name: demo-agent
      description: Demo subagent
      ---

      See {rulebook:shell-conventions} before writing a script.

    `;

    const output = renderSubagentForHarness(source, {
      overlayYaml: CLAUDE_OVERLAY,
      fileRelPath: 'demo-agent.md',
      sourceLabel: 'subagents/demo-agent.md',
      anchor: homeAnchor('.claude'),
      guidanceFileName: 'CLAUDE.md',
      homeDir: '.claude',
      harnessId: 'claude',
      skillSigil: '/',
      subagentSigil: '',
      rulebooks: RULEBOOKS,
    });

    expect(output).toContain('See /shell-rules before writing a script.');
    expect(output).not.toContain('{rulebook:');
  });

  it('throws when a subagent body names a rulebook that deploys no skill to invoke', () => {
    const source = dedent`
      ---
      name: demo-agent
      description: Demo subagent
      ---

      See {rulebook:nmr-cheatsheet} for detail.

    `;

    expect(() =>
      renderSubagentForHarness(source, {
        overlayYaml: CLAUDE_OVERLAY,
        fileRelPath: 'demo-agent.md',
        sourceLabel: 'subagents/demo-agent.md',
        anchor: homeAnchor('.claude'),
        guidanceFileName: 'CLAUDE.md',
        homeDir: '.claude',
        harnessId: 'claude',
        skillSigil: '/',
        subagentSigil: '',
        rulebooks: RULEBOOKS,
      }),
    ).toThrow(/names an ambient-only rulebook/);
  });

  it('rewrites a relative Markdown link to the path its anchor names', () => {
    const output = renderSubagentForHarness(SOURCE, {
      overlayYaml: CLAUDE_OVERLAY,
      fileRelPath: 'demo-agent.md',
      sourceLabel: 'subagents/demo-agent.md',
      anchor: homeAnchor('.claude'),
      guidanceFileName: 'CLAUDE.md',
      homeDir: '.claude',
      harnessId: 'claude',
      skillSigil: '/',
      subagentSigil: '',
      rulebooks: NO_RULEBOOKS,
    });

    expect(output).toContain('[the guide](~/.claude/guide.md)');
  });

  it('strips a declared guidance hook from the deployed body', () => {
    const source = `${SOURCE}<!-- guidance-hook: implementation-preferences -->\n\nTail prose.\n`;

    const output = renderSubagentForHarness(source, {
      overlayYaml: CLAUDE_OVERLAY,
      fileRelPath: 'demo-agent.md',
      sourceLabel: 'subagents/demo-agent.md',
      anchor: homeAnchor('.claude'),
      guidanceFileName: 'CLAUDE.md',
      homeDir: '.claude',
      harnessId: 'claude',
      skillSigil: '/',
      subagentSigil: '',
      rulebooks: NO_RULEBOOKS,
    });

    expect(output).not.toContain('guidance-hook');
    expect(output).toContain('Tail prose.');
  });

  it('fills a declared guidance hook with the guidance bound to it', () => {
    const source = `${SOURCE}<!-- guidance-hook: impl -->\n\nTail prose.\n`;

    const output = renderSubagentForHarness(source, {
      overlayYaml: CLAUDE_OVERLAY,
      fileRelPath: 'demo-agent.md',
      sourceLabel: 'subagents/demo-agent.md',
      anchor: homeAnchor('.claude'),
      guidanceFileName: 'CLAUDE.md',
      homeDir: '.claude',
      harnessId: 'claude',
      skillSigil: '/',
      subagentSigil: '',
      rulebooks: NO_RULEBOOKS,
      guidanceHookFills: new Map([['impl', [{ slug: 'layout', body: '# Layout\n\nGroup source by role.\n' }]]]),
    });

    expect(output).toContain('<!-- codeassembly-guidance-hook:impl:start -->');
    expect(output).toContain('<!-- rulebook:layout -->');
    expect(output).toContain('## Layout');
    expect(output).toContain('Tail prose.');
    expect(output).toContain('permissionMode: bypassPermissions');
  });

  it('rejects a hook declared inside the frontmatter block when a binding would fill it', () => {
    const source = '---\nname: demo-agent\n<!-- guidance-hook: impl -->\n---\n\nBody.\n';

    expect(() =>
      renderSubagentForHarness(source, {
        overlayYaml: CLAUDE_OVERLAY,
        fileRelPath: 'demo-agent.md',
        sourceLabel: 'subagents/demo-agent.md',
        anchor: homeAnchor('.claude'),
        guidanceFileName: 'CLAUDE.md',
        homeDir: '.claude',
        harnessId: 'claude',
        skillSigil: '/',
        subagentSigil: '',
        rulebooks: NO_RULEBOOKS,
        guidanceHookFills: new Map([['impl', [{ slug: 'layout', body: 'Bound guidance.\n' }]]]),
      }),
    ).toThrow(/subagents\/demo-agent\.md:3 .* reason=fill-in-frontmatter/);
  });

  it('throws a source-labelled error for a hook declared twice in one body', () => {
    const source = `${SOURCE}<!-- guidance-hook: preferences -->\n<!-- guidance-hook: preferences -->\n`;

    expect(() =>
      renderSubagentForHarness(source, {
        overlayYaml: CLAUDE_OVERLAY,
        fileRelPath: 'demo-agent.md',
        sourceLabel: 'subagents/demo-agent.md',
        anchor: homeAnchor('.claude'),
        guidanceFileName: 'CLAUDE.md',
        homeDir: '.claude',
        harnessId: 'claude',
        skillSigil: '/',
        subagentSigil: '',
        rulebooks: NO_RULEBOOKS,
      }),
    ).toThrow(/subagents\/demo-agent\.md:\d+ name="preferences" .* reason=duplicate-hook/);
  });

  it('throws a source-labelled error for an anchor naming no heading in the same body', () => {
    const source = `${SOURCE}See [the findings](#finding-scheme).\n`;

    expect(() =>
      renderSubagentForHarness(source, {
        overlayYaml: CLAUDE_OVERLAY,
        fileRelPath: 'demo-agent.md',
        sourceLabel: 'subagents/demo-agent.md',
        anchor: homeAnchor('.claude'),
        guidanceFileName: 'CLAUDE.md',
        homeDir: '.claude',
        harnessId: 'claude',
        skillSigil: '/',
        subagentSigil: '',
        rulebooks: NO_RULEBOOKS,
      }),
    ).toThrow(/subagents\/demo-agent\.md carries 1 unresolvable anchor link target/);
  });

  it('throws ToolNameRewriteError for a tool the harness does not name', () => {
    expect(() =>
      renderSubagentForHarness(SOURCE.replace('{tool:Read}', '{tool:NoSuchTool}'), {
        overlayYaml: '',
        fileRelPath: 'demo-agent.md',
        sourceLabel: 'subagents/demo-agent.md',
        anchor: homeAnchor('.claude'),
        guidanceFileName: 'CLAUDE.md',
        homeDir: '.claude',
        harnessId: 'claude',
        skillSigil: '/',
        subagentSigil: '',
        rulebooks: NO_RULEBOOKS,
      }),
    ).toThrow(ToolNameRewriteError);
  });

  it.each([
    {
      harnessId: 'claude' as const,
      overlayYaml: CLAUDE_OVERLAY,
      guidanceFileName: 'CLAUDE.md',
      homeDir: '.claude',
      skillSigil: '/',
      subagentSigil: '',
    },
    {
      harnessId: 'rovo' as const,
      overlayYaml: ROVO_OVERLAY,
      guidanceFileName: 'AGENTS.md',
      homeDir: ROVO_HOME,
      skillSigil: '!',
      subagentSigil: '',
    },
  ])(
    'produces the same $harnessId output as the standalone merge → tools → invocations → markdown-path → template steps',
    ({ harnessId, overlayYaml, guidanceFileName, homeDir, skillSigil, subagentSigil }) => {
      const merged = mergeFrontmatter(SOURCE, overlayYaml);
      const rewrittenTools = rewriteToolNames(merged, harnessId, 'subagents/demo-agent.md');
      const rewrittenInvocations = rewriteInvocationTokens(
        rewrittenTools,
        { skillSigil, subagentSigil },
        'subagents/demo-agent.md',
        NO_RULEBOOKS,
      );
      const rewrittenPaths = rewriteMarkdownPaths(rewrittenInvocations, 'demo-agent.md', homeAnchor(homeDir));
      const expected = rewriteTemplateVariables(rewrittenPaths, { guidanceFileName, harnessId, homeDir });

      const rendered = renderSubagentForHarness(SOURCE, {
        overlayYaml,
        fileRelPath: 'demo-agent.md',
        sourceLabel: 'subagents/demo-agent.md',
        anchor: homeAnchor(homeDir),
        guidanceFileName,
        homeDir,
        harnessId,
        skillSigil,
        subagentSigil,
        rulebooks: NO_RULEBOOKS,
      });

      expect(rendered).toBe(expected);
    },
  );
});
