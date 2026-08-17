import { describe, expect, it } from 'vitest';

import { extractApprovedLede } from '../lede-sections.ts';

const AGENT_LEDE = 'Rulebooks can now address a file by linking to it.';
const MERGED_LEDE = 'Rulebooks can now address a file by linking to it: a Markdown link reaches each harness.';

describe(extractApprovedLede, () => {
  it('reads the merged lede from a record carrying one, whichever verdict its author recorded', () => {
    expect(extractApprovedLede(bodyWith({ merged: true }))).toBe(MERGED_LEDE);
  });

  it('reads the agent lede from a record carrying no merged section, whichever verdict its author recorded', () => {
    expect(extractApprovedLede(bodyWith({ merged: false }))).toBe(AGENT_LEDE);
  });

  it('yields null for a body carrying neither lede heading', () => {
    expect(extractApprovedLede('## Comment\n\nCut the setup clause.\n')).toBeNull();
  });

  it('never yields the author comment, which is critique rather than a lede', () => {
    const body = bodyWith({ merged: true, comment: 'Cut the setup clause.' });

    expect(extractApprovedLede(body)).toBe(MERGED_LEDE);
  });

  it('reads a multi-paragraph lede whole', () => {
    const body = '## Agent lede\n\nFirst paragraph.\n\nSecond paragraph.\n\n## Comment\n\nToo long.\n';

    expect(extractApprovedLede(body)).toBe('First paragraph.\n\nSecond paragraph.');
  });
});

// region | Helpers

/** Renders a decision body in the shape `prepareDecision` writes: the agent lede, then the optional merged lede and comment. */
function bodyWith(input: { merged: boolean; comment?: string }): string {
  const sections = [`## Agent lede\n\n${AGENT_LEDE}`];
  if (input.merged) {
    sections.push(`## Merged lede\n\n${MERGED_LEDE}`);
  }
  if (input.comment !== undefined) {
    sections.push(`## Comment\n\n${input.comment}`);
  }
  return `${sections.join('\n\n')}\n`;
}

// endregion | Helpers
