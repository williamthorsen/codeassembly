import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { DEFAULT_KB_SENTINEL } from '../../src/kb-shared/default-kb-sentinel.ts';
import { ARTIFACT_TYPES } from '../../src/lib/artifact-types.ts';
import { resolveContentDir } from '../../src/lib/content-resolver.ts';
import { libraryResolver } from '../../src/lib/content-sources.ts';
import { resolveClosure } from '../../src/lib/dependency-resolver.ts';
import { readDirEntries } from '../../src/lib/fs-helpers.ts';

// The vetted collection claims its members name nothing specific to one author's environment, and a knowledge-store
// name is the form that claim fails in most quietly: a reader copies the invocation, and the capture is refused
// against a registry that never held the store. The scanned set is the collection's resolved closure, so a promotion
// brings an artifact under the rule and a demotion releases it, and no exemption list exists to rot.
//
// What this cannot catch: a concrete store named in prose rather than in an argument position, and a value sitting
// further from its flag than the neighboring table cell. The guard keeps the decidable position from regressing; it
// does not prove the closure names no store at all.

/** The collection whose closure the rule binds. */
const VETTED_COLLECTION = 'recommended';

/** A flag and the value it takes, in either the spaced or the `=` form; a following flag is not a value. */
const STORE_FLAG_PATTERN = /(?:--store|--kb)(?:=|[ \t]+)(?!-)(\S+)/g;

/** A table cell holding a store flag and nothing else, the left half of the table form. */
const FLAG_CELL_PATTERN = /^`(?:--store|--kb)`$/;

/** The code span a value cell opens with, whose content is the store the row assigns to the flag. */
const LEADING_CODE_SPAN_PATTERN = /^`([^`]+)`/;

const CODE_SPAN_PATTERN = /`([^`]+)`/g;

const FENCE_PATTERN = /^\s*```/;

interface Violation {
  readonly file: string;
  readonly line: number;
  readonly store: string;
  readonly text: string;
}

describe('vetted store conventions', () => {
  const contentDir = resolveContentDir();

  it(`names no concrete store in a --store or --kb argument position across ${VETTED_COLLECTION}'s closure`, async () => {
    const violations = await findViolations(contentDir);

    expect(violations, formatViolations(violations)).toEqual([]);
  });

  // An empty closure yields no violation and reads as a pass, so this pins the scanned set to the closure's members.
  it('scans a Markdown file for every artifact the closure holds', async () => {
    const closure = await resolveClosure({ collection: [VETTED_COLLECTION] }, libraryResolver(contentDir));
    const members = [...closure.rulebooks, ...closure.skills, ...closure.subagents];
    const scannedFiles = await listClosureFiles(contentDir);

    expect(members.length).toBeGreaterThan(0);
    expect(members.filter((slug) => scannedFiles.every((file) => !file.includes(slug)))).toEqual([]);
  });

  describe('classifier', () => {
    it('flags a store sharing a code span with its flag', () => {
      expect(findConcreteStores('Pass `--store codeassembly` to route the record.', false)).toEqual(['codeassembly']);
    });

    it('flags a store on a fenced invocation line', () => {
      expect(findConcreteStores('  --kb=coding \\', true)).toEqual(['coding']);
    });

    it('flags a store opening the cell beside a flag-only table cell', () => {
      expect(findConcreteStores('| `--store` | `codeassembly`, the agent-guidance KB. | Yes |', false)).toEqual([
        'codeassembly',
      ]);
    });

    it('flags an at-prefixed value that is not the default-KB sentinel', () => {
      expect(findConcreteStores('Pass `--store @defualt` here.', false)).toEqual(['@defualt']);
    });

    it('permits an angle-bracket placeholder', () => {
      expect(findConcreteStores('Run it with `--store <name|@default>` to choose.', false)).toEqual([]);
    });

    it('permits the default-KB sentinel', () => {
      expect(findConcreteStores(`Route it with \`--store ${DEFAULT_KB_SENTINEL}\`.`, false)).toEqual([]);
    });

    it('does not flag a bare flag mention that prose follows', () => {
      expect(findConcreteStores('`--store` is required: every capture names its destination.', false)).toEqual([]);
    });

    it('does not flag a table cell that opens with prose', () => {
      const row = '| `--store` | Registry name of the store, or `@default` for the `default_kb`. | Yes |';

      expect(findConcreteStores(row, false)).toEqual([]);
    });
  });
});

// region | Helpers

/**
 * Reports every concrete store one content line names in a `--store` or `--kb` argument position. Two positions
 * count: the value sharing a code span (or a fenced line) with the flag, and the value opening the cell beside a
 * table cell holding the flag alone. Prose outside a code span is not an argument position and is never read.
 */
function findConcreteStores(line: string, isFenced: boolean): Array<string> {
  const values = isFenced ? readFlagValues(line) : listCodeSpans(line).flatMap(readFlagValues);
  const cellStore = isFenced ? undefined : readTableCellStore(line);
  if (cellStore !== undefined) {
    values.push(cellStore);
  }
  return values.filter((value) => !isPermittedStoreValue(value));
}

/** Reports every argument-position store name across the Markdown of the vetted collection's closure. */
async function findViolations(contentDir: string): Promise<ReadonlyArray<Violation>> {
  const violations: Array<Violation> = [];
  const relativePaths = await listClosureFiles(contentDir);
  for (const relativePath of relativePaths) {
    const lines = (await readFile(path.join(contentDir, relativePath), 'utf8')).split('\n');
    let isFenced = false;
    for (const [index, line] of lines.entries()) {
      if (FENCE_PATTERN.test(line)) {
        isFenced = !isFenced;
        continue;
      }
      for (const store of findConcreteStores(line, isFenced)) {
        violations.push({ file: relativePath, line: index + 1, store, text: line.trim() });
      }
    }
  }
  return violations;
}

/** Renders the violations as an assertion message naming each file, line, and store, along with the remedy. */
function formatViolations(violations: ReadonlyArray<Violation>): string {
  if (violations.length === 0) return '';
  const header =
    `Found ${violations.length} concrete store name(s) in a --store or --kb argument position within ` +
    `${VETTED_COLLECTION}'s closure. A vetted artifact names no store that exists only in one environment: ` +
    `replace each with an angle-bracket placeholder, with \`${DEFAULT_KB_SENTINEL}\`, or with a rule for ` +
    `choosing the destination.`;
  const lines = violations.map(
    (violation) => `  ${violation.file}:${violation.line} (${violation.store}): ${violation.text}`,
  );
  return [header, ...lines].join('\n');
}

/** True when a value in a flag position names no real store: a placeholder, or the default-KB sentinel. */
function isPermittedStoreValue(value: string): boolean {
  return value === DEFAULT_KB_SENTINEL || (value.startsWith('<') && value.endsWith('>'));
}

/**
 * Lists the Markdown files of the vetted collection's closure, relative to `contentDir`. A skill contributes every
 * Markdown file under its directory; the committed helper bundles beside them are minified to single lines, so a
 * line-based report would dump one, and a bundle's fix lives upstream in `src/` regardless.
 */
async function listClosureFiles(contentDir: string): Promise<ReadonlyArray<string>> {
  const closure = await resolveClosure({ collection: [VETTED_COLLECTION] }, libraryResolver(contentDir));
  const flatFiles = [
    ...closure.rulebooks.map((slug) => path.join(ARTIFACT_TYPES.rulebook.contentPath, `${slug}.md`)),
    ...closure.subagents.map((slug) => path.join(ARTIFACT_TYPES.subagent.contentPath, `${slug}.md`)),
  ];
  const skillFiles = await Promise.all(
    closure.skills.map((slug) => listMarkdownFilesUnder(contentDir, path.join(ARTIFACT_TYPES.skill.contentPath, slug))),
  );
  return [...flatFiles, ...skillFiles.flat()].toSorted();
}

/** Extracts the content of each backtick-delimited code span on a line. */
function listCodeSpans(text: string): Array<string> {
  return text
    .matchAll(CODE_SPAN_PATTERN)
    .map((match) => match[1] ?? '')
    .toArray();
}

/** Lists every Markdown file under `relativeDir`, recursively, as paths relative to `root`. */
async function listMarkdownFilesUnder(root: string, relativeDir: string): Promise<Array<string>> {
  const foundFiles: Array<string> = [];
  const entries = await readDirEntries(path.join(root, relativeDir));
  for (const entry of entries) {
    const relativePath = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      foundFiles.push(...(await listMarkdownFilesUnder(root, relativePath)));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      foundFiles.push(relativePath);
    }
  }
  return foundFiles;
}

/** Reads each value a store flag takes within one span of text, in either the spaced or the `=` form. */
function readFlagValues(text: string): Array<string> {
  return text
    .matchAll(STORE_FLAG_PATTERN)
    .flatMap((match) => (match[1] === undefined ? [] : [match[1]]))
    .toArray();
}

/**
 * Reads the store a table row assigns to a flag: the row holds a cell that is the flag alone, and the cell beside it
 * opens with a code span. A value cell opening with prose states no argument, so it yields nothing.
 */
function readTableCellStore(line: string): string | undefined {
  const trimmedLine = line.trim();
  if (!trimmedLine.startsWith('|')) return undefined;

  const cells = trimmedLine.split('|').map((cell) => cell.trim());
  if (cells[0] === '') cells.shift();
  if (cells.at(-1) === '') cells.pop();

  for (const [index, cell] of cells.entries()) {
    if (!FLAG_CELL_PATTERN.test(cell)) continue;
    const leadingSpanMatch = LEADING_CODE_SPAN_PATTERN.exec(cells[index + 1] ?? '');
    if (leadingSpanMatch?.[1] !== undefined) return leadingSpanMatch[1];
  }
  return undefined;
}

// endregion | Helpers
