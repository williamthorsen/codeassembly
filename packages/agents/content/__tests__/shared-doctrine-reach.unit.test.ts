import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { expandIncludes } from '../../src/lib/directive-expander.ts';
import { countOccurrences } from '../test-utils/count-occurrences.ts';
import { listMarkdownFiles } from '../test-utils/list-markdown-files.ts';
import { listGovernedSubagents, SHARED_DOCTRINE_CARRIERS } from '../test-utils/shared-doctrine-carriers.ts';

// `guidance/shared/AGENTS.md` installs unconditionally, so every interactive session receives all of it. A subagent
// runs on its own system prompt and loads no guidance file, so a section its role's work needs reaches it only by
// being inlined. Both hosts now source the text from one partial, and these assertions are what keep a copy from
// creeping back into either.
const CONTENT_ROOT = new URL('../', import.meta.url).pathname;

/** Each extracted section: the string counted for single-statement checks, and phrases a gutted partial would lose. */
const SECTIONS: Readonly<Record<string, { headline: string; phrases: ReadonlyArray<string> }>> = {
  'code-descriptions': {
    headline: '## Code descriptions',
    // `comment-discipline.md` states the same baseline at length, so these are the short form's own wording.
    phrases: ['gets a brief description', 'In languages with doc-tag conventions'],
  },
  'code-style': {
    headline: '## Style',
    phrases: ['Code style should adhere to', 'Use long-form CLI options', 'Name functions with a leading verb'],
  },
  concision: {
    headline: '## Concision',
    // `skills/_data/concision.md` states the full principle this section summarizes, and the two share sentences.
    // These are the summary's own, so the single-statement check below reads as a duplicate rather than the pairing.
    phrases: [
      'then costs the reader attention and hides the signal',
      'Lead with the minimal skeleton and add a sentence only when it changes what the reader does',
    ],
  },
  'file-access': {
    headline: '## File access',
    phrases: ['When given an exact file path', 'STOP and report the missing path'],
  },
  'live-repo-writes': {
    headline: "## Don't test write operations against a live repo",
    phrases: ['Never exercise destructive or side-effecting operations', 'I can just clean up afterward'],
  },
  'plain-speech': {
    // Headingless, because subagents inline it inside `<HARD-GATE>` blocks where a heading would be wrong.
    headline: 'When writing practical documentation, speak plainly',
    phrases: [
      'Use the clearest verb',
      'a tool **reports** its findings (not "the findings arrive")',
      'persuasive documentation such as marketing and website copy',
    ],
  },
  'shell-commands': {
    headline: '## Shell commands',
    phrases: ['Compound `cd &&` commands'],
  },
  'technical-recommendations': {
    headline: '## Technical recommendations',
    phrases: ['Default to current best practices', 'Prefer CLI tools over web UI instructions'],
  },
};

/** The shared file's sections in source order, each with a phrase proving its body arrived rather than its heading. */
const SHARED_GUIDANCE_SECTIONS: ReadonlyArray<{ heading: string; phrase: string }> = [
  { heading: '## Interactive work', phrase: 'Invoke the `collaborate` skill when working interactively' },
  { heading: '## Style', phrase: 'Code style should adhere to' },
  { heading: '## Concision', phrase: 'then costs the reader attention and hides the signal' },
  { heading: '## Plain speech', phrase: 'When writing practical documentation, speak plainly' },
  { heading: '## Code descriptions', phrase: 'gets a brief description' },
  { heading: '## File access', phrase: 'When given an exact file path' },
  { heading: '## Shell commands', phrase: 'Compound `cd &&` commands' },
  {
    heading: "## Don't test write operations against a live repo",
    phrase: 'Never exercise destructive or side-effecting operations',
  },
  { heading: '## Technical recommendations', phrase: 'Default to current best practices' },
  { heading: '## Artifacts', phrase: 'invoke the `save-artifact` skill to resolve path and naming' },
  { heading: '## Commits', phrase: 'Invoke the `create-commit` skill to make a commit' },
];

/** The guidance files that inline the shared file, one per harness. */
const HARNESS_GUIDANCE: ReadonlyArray<string> = [
  'guidance/_harnesses/claude/CLAUDE.md',
  'guidance/_harnesses/rovo/AGENTS.md',
];

describe('shared-doctrine reach', () => {
  describe.each(Object.entries(SECTIONS))('%s', (name, { headline, phrases }) => {
    const carriers = SHARED_DOCTRINE_CARRIERS[name] ?? [];

    it.each(carriers)('reaches %s', async (slug) => {
      const expanded = await expandSubagent(slug);

      for (const phrase of phrases) {
        expect(expanded).toContain(phrase);
      }
      expect(countOccurrences(expanded, headline)).toBe(1);
    });

    it('reaches no subagent the section does not govern', async () => {
      const others = listGovernedSubagents().filter((slug) => !carriers.includes(slug));
      const violations: Array<string> = [];

      for (const slug of others) {
        if ((await expandSubagent(slug)).includes(headline)) {
          violations.push(slug);
        }
      }

      const message = `${name} governs no part of these subagents' work, and each line of it is weight they pay at every invocation:\n  ${violations.join('\n  ')}`;
      expect(violations, message).toEqual([]);
    });

    it('is stated in no content file but the partial', async () => {
      const violations = await findRestatements(`_partials/${name}.md`, phrases);

      const message = `The rule is stated once and inlined from there; these files restate it instead of including it:\n  ${violations.join('\n  ')}`;
      expect(violations, message).toEqual([]);
    });
  });

  // The extraction gave these sections a second audience without changing the first. A section pulled into a partial
  // and wired only to subagents would silently strip doctrine from every interactive session; nothing else catches it.
  describe.each(HARNESS_GUIDANCE)('%s', (relativePath) => {
    it('renders every shared section once, in source order', async () => {
      const lines = (await expandIncludes(path.join(CONTENT_ROOT, relativePath), CONTENT_ROOT)).split('\n');

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
      const expanded = await expandIncludes(path.join(CONTENT_ROOT, relativePath), CONTENT_ROOT);

      for (const { heading, phrase } of SHARED_GUIDANCE_SECTIONS) {
        expect(expanded, `${heading} lost its body`).toContain(phrase);
      }
    });
  });
});

// region | Helpers

/** Returns a subagent's include-expanded body, what the deploy pipeline goes on to rewrite and write out. */
async function expandSubagent(slug: string): Promise<string> {
  return expandIncludes(path.join(CONTENT_ROOT, 'subagents', `${slug}.md`), CONTENT_ROOT);
}

/** Returns `file -> phrase` for every content file but the partial that states one of the phrases. */
async function findRestatements(partialPath: string, phrases: ReadonlyArray<string>): Promise<ReadonlyArray<string>> {
  const violations: Array<string> = [];
  const files = await listMarkdownFiles(CONTENT_ROOT);

  for (const file of files) {
    const relativePath = path.relative(CONTENT_ROOT, file);
    if (relativePath === partialPath) continue;

    const content = await readFile(file, 'utf8');
    for (const phrase of phrases) {
      if (content.includes(phrase)) {
        violations.push(`${relativePath} -> ${phrase}`);
      }
    }
  }

  return violations;
}

// endregion | Helpers
