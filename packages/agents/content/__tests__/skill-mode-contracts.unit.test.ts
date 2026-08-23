import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

// A skill can direct another skill into a named mode, and the two halves of that contract sit in different files with
// no include tying them together. Deleting the definition leaves the directive naming a mode nothing defines, and the
// callee falls back to its default behavior (the wider edit the directive exists to prevent), with every other test
// still passing. The directive's own reach is checked in `spec-inlining.unit.test.ts`; this file checks that what
// it names is actually defined.
const SKILLS_ROOT = new URL('../skills/', import.meta.url).pathname;

interface ModeContract {
  /** The mode's name, as the directive and the definition both spell it. */
  readonly mode: string;
  /** The file directing a caller into the mode, and the phrase that does the directing. */
  readonly caller: { readonly path: string; readonly phrase: string };
  /** The file defining the mode, and the phrase that states its contract. */
  readonly callee: { readonly path: string; readonly phrase: string };
}

const MODE_CONTRACTS: ReadonlyArray<ModeContract> = [
  {
    caller: {
      path: '_partials/next-steps-after-review.md',
      phrase: 'in criteria-only mode',
    },
    callee: {
      path: 'align-ticket-with-implementation/SKILL.md',
      phrase: 'revise `## Acceptance criteria` alone',
    },
    mode: 'criteria-only mode',
  },
  {
    caller: {
      path: '_partials/next-steps-after-review.md',
      phrase: 'bound to the previewed delta',
    },
    callee: {
      path: 'align-ticket-with-implementation/SKILL.md',
      phrase: 'the previewed delta is the whole of the revision',
    },
    mode: 'ratified-delta mode',
  },
];

describe('skill mode contracts', () => {
  it.each(MODE_CONTRACTS)('$mode is defined by the skill its directive names', async ({ caller, callee, mode }) => {
    const callerBody = await readFile(path.join(SKILLS_ROOT, caller.path), 'utf8');
    const calleeBody = await readFile(path.join(SKILLS_ROOT, callee.path), 'utf8');

    expect(
      callerBody,
      `\`${caller.path}\` no longer directs a caller into ${mode}. Restore the directive, or drop the contract from ` +
        `MODE_CONTRACTS if the mode is retired.`,
    ).toContain(caller.phrase);

    expect(
      calleeBody,
      `\`${caller.path}\` directs a caller into ${mode}, but \`${callee.path}\` no longer defines it. The callee ` +
        `falls back to its default behavior, silently widening the edit past what the caller previewed.`,
    ).toContain(callee.phrase);
  });
});
