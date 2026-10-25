import { describe, expect, it } from 'vitest';

import { DOCTRINE_REACH, HARNESS_GUIDANCE } from '../test-utils/doctrine-reach.ts';
import { listGovernedSubagents } from '../test-utils/list-governed-subagents.ts';
import { readContentFile } from '../test-utils/read-content-file.ts';
import { SHARED_DOCTRINE_CARRIERS } from '../test-utils/shared-doctrine-carriers.ts';

// `guidance/shared/AGENTS.md` installs unconditionally, so every interactive session receives all of it. Because a
// subagent runs on its own system prompt and does not load any guidance file, it receives a section that its role's
// work needs only when the section is inlined. `doctrine-reach.unit.test.ts` checks that each section reaches its
// carriers; this file checks that it reaches no other subagent, and that the shared file renders every section.

/** The rows of the reach table that `guidance/shared/AGENTS.md` states or inlines, whether or not a subagent shares it. */
const SHARED_SECTIONS: ReadonlyArray<string> = [
  'code-descriptions',
  'code-style',
  'concision',
  'file-access',
  'live-repo-writes',
  'plain-speech',
  'shell-commands',
  'technical-recommendations',
];

/**
 * The shared file's sections in source order, each with a phrase proving that its body rendered, not only its heading.
 */
const SHARED_GUIDANCE_SECTIONS: ReadonlyArray<{ heading: string; phrase: string }> = [
  { heading: '## Interactive work', phrase: 'Invoke the `collaborate` skill when working interactively' },
  { heading: '## Style', phrase: 'fill new comments to its `max_line_length`' },
  { heading: '## Concision', phrase: "then wastes the reader's attention and hides the signal" },
  { heading: '## Plain speech', phrase: 'Speak plainly in practical documentation' },
  { heading: '## Code descriptions', phrase: 'gets a brief description' },
  { heading: '## File access', phrase: 'When given an exact file path' },
  { heading: '## Shell commands', phrase: 'Compound `cd &&` commands' },
  {
    heading: "## Don't test write operations against a live repo",
    phrase: 'Never exercise destructive or side-effecting operations',
  },
  { heading: '## Technical recommendations', phrase: 'Default to current best practices' },
  { heading: '## Artifacts', phrase: 'invoke the `save-artifact` skill to resolve path and naming' },
  {
    heading: '## Documentation placement',
    phrase: 'write a pointer to its source and add only what the source does not state',
  },
  { heading: '## Authorship', phrase: 'shows which account made an item, not who wrote it' },
  { heading: '## Commits', phrase: 'Invoke the `create-commit` skill to make a commit' },
];

describe('shared-doctrine reach', () => {
  describe.each(SHARED_SECTIONS)('%s', (name) => {
    it('is not inlined into any subagent that the section does not govern', async () => {
      const { headline } = readSection(name);
      const governed = SHARED_DOCTRINE_CARRIERS[name] ?? [];
      const others = listGovernedSubagents().filter((slug) => !governed.includes(slug));
      const violations: Array<string> = [];

      for (const slug of others) {
        if ((await readContentFile(`subagents/${slug}.md`)).includes(headline)) {
          violations.push(slug);
        }
      }

      const message = `${name} does not govern any part of these subagents' work, and each line of it adds tokens to every invocation of them:\n  ${violations.join('\n  ')}`;
      expect(violations, message).toEqual([]);
    });
  });

  // These sections serve the interactive session as well as the subagent. A section moved into a partial and included
  // only by subagents would silently strip doctrine from every interactive session; nothing else catches it.
  describe.each(HARNESS_GUIDANCE)('%s', (relativePath) => {
    it('renders every shared section once, in source order', async () => {
      const lines = (await readContentFile(relativePath)).split('\n');

      const positions = SHARED_GUIDANCE_SECTIONS.map(({ heading }) => {
        expect(
          lines.filter((line) => line === heading),
          `${heading} appears other than once`,
        ).toHaveLength(1);
        return lines.indexOf(heading);
      });

      expect(positions).toEqual(positions.toSorted((a, b) => a - b));
    });

    it('renders every shared section body', async () => {
      const expanded = await readContentFile(relativePath);

      for (const { heading, phrase } of SHARED_GUIDANCE_SECTIONS) {
        expect(expanded, `${heading} lost its body`).toContain(phrase);
      }
    });
  });
});

// region | Helpers

/** Returns a shared section's row of the reach table. */
function readSection(name: string): (typeof DOCTRINE_REACH)[string] {
  const section = DOCTRINE_REACH[name];
  if (section === undefined) throw new Error(`The reach table does not contain ${name}`);
  return section;
}

// endregion | Helpers
