import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { CONTENT_ROOT } from '../test-utils/content-root.ts';
import { countOccurrences } from '../test-utils/count-occurrences.ts';
import { listGovernedSubagents } from '../test-utils/list-governed-subagents.ts';
import { listMarkdownFiles } from '../test-utils/list-markdown-files.ts';
import { readContentFile } from '../test-utils/read-content-file.ts';
import { SHARED_DOCTRINE_CARRIERS } from '../test-utils/shared-doctrine-carriers.ts';

// `guidance/shared/AGENTS.md` installs unconditionally, so every interactive session receives all of it. Because a
// subagent runs on its own system prompt and does not load any guidance file, it receives a section that its role's
// work needs only when the section is inlined. Both hosts source the text from one partial, and these assertions keep
// either host from regaining a copy of its own.

// The restatement check runs once per entry in SECTIONS, and each pass reads every authored Markdown file in the
// tree. Reading them once here limits the whole suite to a single pass.
const CONTENT_FILES = readContentFiles();

/** The shared guidance file, which states the sections that it does not share with any subagent. */
const SHARED_GUIDANCE = 'guidance/shared/AGENTS.md';

/**
 * Each shared section: the string counted for single-statement checks, phrases that a gutted section would lose, and
 * the file that states it when that file is not `_partials/{name}.md`.
 */
const SECTIONS: Readonly<Record<string, { headline: string; phrases: ReadonlyArray<string>; source?: string }>> = {
  'code-descriptions': {
    source: SHARED_GUIDANCE,
    headline: '## Code descriptions',
    // Pins the rule's universality, so that a restored carve-out fails. `comment-discipline.md` opens with the same
    // words, so the phrase stops at the verb at which the two differ.
    phrases: ['Every function, method, class, and component gets', 'In languages with doc-tag conventions'],
  },
  'code-style': {
    source: SHARED_GUIDANCE,
    headline: '## Style',
    phrases: [
      'fill new comments to its `max_line_length`',
      'Use long-form CLI options',
      'Name functions with a leading verb',
    ],
  },
  concision: {
    headline: '## Concision',
    // `skills/_data/concision.md` states the full principle that this section summarizes, and the two share sentences.
    // These are the summary's own, so the single-statement check below would report a duplicate rather than accept the
    // pairing.
    phrases: [
      "then wastes the reader's attention and hides the signal",
      'Lead with the minimal skeleton and add a sentence only when it changes what the reader does',
    ],
  },
  'file-access': {
    headline: '## File access',
    phrases: ['When given an exact file path', 'STOP and report the missing path'],
  },
  'live-repo-writes': {
    source: SHARED_GUIDANCE,
    headline: "## Don't test write operations against a live repo",
    phrases: ['Never exercise destructive or side-effecting operations', 'I can just clean up afterward'],
  },
  'plain-speech': {
    // Headingless, because subagents inline it inside `<HARD-GATE>` blocks where a heading would be wrong.
    headline: 'Speak plainly in practical documentation',
    // One phrase per statement that the rule makes operative, plus one of the verb pairs that the rule keeps as illustration.
    phrases: [
      "Write for a reader who does not share the author's first language",
      'The test is about structure, not vocabulary',
      'in code comments, and in chat',
      'The one carve-out is presentational text',
      'This rule takes precedence over the register of the surrounding documents',
      'still be **mannered prose**',
      'A verb that fits any subject and object does not state any relation between them',
      'an imperative there would give the action to the reader',
      'a tool **reports** its findings (not "the findings arrive")',
    ],
  },
  'shell-commands': {
    headline: '## Shell commands',
    phrases: ['Compound `cd &&` commands'],
  },
  'technical-recommendations': {
    headline: '## Technical recommendations',
    phrases: [
      'Default to current best practices',
      'name the solutions that current best practice applies',
      'Label an option that departs from all of them as non-standard',
      'rather than an addition that works around the current contract',
      'Prefer CLI tools over web UI instructions',
    ],
  },
};

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

/**
 * Skills that inline a shared section directly. The carrier populations above read `subagents/` alone, so a skill's
 * include is asserted here or nowhere, and a dropped one would strip the doctrine from that skill in silence.
 */
const SKILL_CARRIERS: ReadonlyArray<{ readonly relativePath: string; readonly section: string }> = [
  { relativePath: 'skills/revise-prose/SKILL.md', section: 'plain-speech' },
];

/** The guidance files that inline the shared file, one per harness. */
const HARNESS_GUIDANCE: ReadonlyArray<string> = [
  'guidance/_harnesses/claude/CLAUDE.md',
  'guidance/_harnesses/rovo/AGENTS.md',
];

describe('shared-doctrine reach', () => {
  describe.each(Object.entries(SECTIONS))('%s', (name, { headline, phrases, source }) => {
    const carriers = SHARED_DOCTRINE_CARRIERS[name] ?? [];

    it.each(carriers)('is inlined into %s', async (slug) => {
      const expanded = await expandSubagent(slug);

      for (const phrase of phrases) {
        expect(expanded).toContain(phrase);
      }
      expect(countOccurrences(expanded, headline)).toBe(1);
    });

    it('is not inlined into any subagent that the section does not govern', async () => {
      const others = listGovernedSubagents().filter((slug) => !carriers.includes(slug));
      const violations: Array<string> = [];

      for (const slug of others) {
        if ((await expandSubagent(slug)).includes(headline)) {
          violations.push(slug);
        }
      }

      const message = `${name} does not govern any part of these subagents' work, and each line of it adds tokens to every invocation of them:\n  ${violations.join('\n  ')}`;
      expect(violations, message).toEqual([]);
    });

    it('is not stated in any content file but the partial', async () => {
      const violations = await findRestatements(source ?? `_partials/${name}.md`, phrases);

      const message = `The rule is stated once and inlined from there; these files restate it instead of including it:\n  ${violations.join('\n  ')}`;
      expect(violations, message).toEqual([]);
    });
  });

  describe.each(SKILL_CARRIERS)('$relativePath', ({ relativePath, section }) => {
    it('renders $section', async () => {
      const expected = SECTIONS[section];
      if (expected === undefined) throw new Error(`The shared sections do not include ${section}`);
      const expanded = await readContentFile(relativePath);

      for (const phrase of expected.phrases) {
        expect(expanded).toContain(phrase);
      }
      expect(countOccurrences(expanded, expected.headline)).toBe(1);
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

/** Returns a subagent's include-expanded body, what the deploy pipeline goes on to rewrite and write out. */
async function expandSubagent(slug: string): Promise<string> {
  return readContentFile(`subagents/${slug}.md`);
}

/** Returns `file -> phrase` for every content file but the source that states one of the phrases. */
async function findRestatements(sourcePath: string, phrases: ReadonlyArray<string>): Promise<ReadonlyArray<string>> {
  const violations: Array<string> = [];
  const files = await CONTENT_FILES;

  for (const { relativePath, content } of files) {
    if (relativePath === sourcePath) continue;

    for (const phrase of phrases) {
      if (content.includes(phrase)) {
        violations.push(`${relativePath} -> ${phrase}`);
      }
    }
  }

  return violations;
}

/** Reads every authored content Markdown file, pairing each with its content-root-relative path. */
async function readContentFiles(): Promise<ReadonlyArray<{ relativePath: string; content: string }>> {
  const files = await listMarkdownFiles(CONTENT_ROOT);
  return Promise.all(
    files.map(async (file) => ({
      relativePath: path.relative(CONTENT_ROOT, file),
      content: await readFile(file, 'utf8'),
    })),
  );
}

// endregion | Helpers
