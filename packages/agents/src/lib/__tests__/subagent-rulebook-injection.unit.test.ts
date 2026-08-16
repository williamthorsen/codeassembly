import { dedent } from '@williamthorsen/toolbelt.strings/candidate';
import { describe, expect, it } from 'vitest';

import type { RulebookInvocationCatalog } from '../invocation-tokens.ts';
import { injectDeclaredRulebooks } from '../subagent-rulebook-injection.ts';

const SOURCE_LABEL = 'subagents/demo-agent.md';

// `shell-conventions` carries a `skill-name` override, so its deployed name is not `consult-<slug>`.
const RULEBOOKS: RulebookInvocationCatalog = new Map([
  ['nmr-cheatsheet', { skillName: 'consult-nmr-cheatsheet', skill: false }],
  ['nmr-scripts', { skillName: 'consult-nmr-scripts', skill: true }],
  ['shell-conventions', { skillName: 'shell-rules', skill: true }],
]);

describe(injectDeclaredRulebooks, () => {
  it('merges each declared rulebook into skills under its deploy name and drops the source key', () => {
    const source = dedent`
      ---
      name: demo-agent
      skills:
        - commit
      rulebooks:
        - nmr-scripts
        - shell-conventions
      ---

      # Demo agent

    `;

    expect(injectDeclaredRulebooks(source, RULEBOOKS, SOURCE_LABEL)).toBe(dedent`
      ---
      name: demo-agent
      skills:
        - commit
        - consult-nmr-scripts
        - shell-rules
      ---

      # Demo agent

    `);
  });

  it('creates the skills list when the subagent declares rulebooks alone', () => {
    const source = '---\nname: demo-agent\nrulebooks:\n  - nmr-scripts\n---\n\n# Demo agent\n';

    expect(injectDeclaredRulebooks(source, RULEBOOKS, SOURCE_LABEL)).toBe(
      '---\nname: demo-agent\nskills:\n  - consult-nmr-scripts\n---\n\n# Demo agent\n',
    );
  });

  it('deduplicates a deploy name the skills list already carries', () => {
    const source = '---\nname: demo-agent\nskills:\n  - shell-rules\nrulebooks:\n  - shell-conventions\n---\n\nBody.\n';

    expect(injectDeclaredRulebooks(source, RULEBOOKS, SOURCE_LABEL)).toBe(
      '---\nname: demo-agent\nskills:\n  - shell-rules\n---\n\nBody.\n',
    );
  });

  it('returns content declaring no rulebooks byte-identically, leaving its frontmatter unserialized', () => {
    // The long description and the flow sequence are what a re-serialization would rewrite.
    const source = dedent`
      ---
      name: demo-agent
      description: A subagent whose description runs past any wrap column a stringifier might otherwise fold it at, twice over.
      tools: [Read, Write, Edit]
      skills:
        - commit
      ---

      # Demo agent

    `;

    expect(injectDeclaredRulebooks(source, RULEBOOKS, SOURCE_LABEL)).toBe(source);
  });

  it('preserves a long description and a flow sequence when it does rewrite the frontmatter', () => {
    const source = dedent`
      ---
      name: demo-agent
      description: A subagent whose description runs past any wrap column a stringifier might otherwise fold it at, twice over.
      tools: [Read, Write, Edit]
      rulebooks:
        - nmr-scripts
      ---

      # Demo agent

    `;

    const output = injectDeclaredRulebooks(source, RULEBOOKS, SOURCE_LABEL);

    expect(output).toContain('description: A subagent whose description runs past any wrap column');
    expect(output).toContain('tools: [Read, Write, Edit]');
    expect(output).toContain('skills:\n  - consult-nmr-scripts\n');
    expect(output).not.toContain('rulebooks:');
  });

  it('keeps a structured skills entry and the extra keys it carries', () => {
    const source = dedent`
      ---
      name: demo-agent
      skills:
        - name: commit
          source: npm
      rulebooks:
        - nmr-scripts
      ---

      Body.

    `;

    expect(injectDeclaredRulebooks(source, RULEBOOKS, SOURCE_LABEL)).toBe(dedent`
      ---
      name: demo-agent
      skills:
        - name: commit
          source: npm
        - consult-nmr-scripts
      ---

      Body.

    `);
  });

  it('keeps a flow skills sequence flow', () => {
    const source = '---\nname: demo-agent\nskills: [commit]\nrulebooks:\n  - nmr-scripts\n---\n\nBody.\n';

    expect(injectDeclaredRulebooks(source, RULEBOOKS, SOURCE_LABEL)).toBe(
      '---\nname: demo-agent\nskills: [commit, consult-nmr-scripts]\n---\n\nBody.\n',
    );
  });

  it('throws naming every unusable entry at once', () => {
    const source = '---\nname: demo-agent\nrulebooks:\n  - nmr-cheatsheet\n  - never-declared\n---\n\nBody.\n';

    expect(() => injectDeclaredRulebooks(source, RULEBOOKS, SOURCE_LABEL)).toThrow(
      /subagents\/demo-agent\.md declares 2 unusable rulebook injection\(s\):[\s\S]*nmr-cheatsheet -- it names an ambient-only rulebook[\s\S]*never-declared -- it names no rulebook in the deployed set/,
    );
  });
});
