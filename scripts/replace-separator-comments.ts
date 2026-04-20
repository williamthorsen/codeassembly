#!/usr/bin/env tsx
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { glob } from 'glob';

const BOX_LINE_RE = /^(\s*)\/\/\s*(-{8,}|={8,})\s*$/;
const SYMMETRIC_RE = /^(\s*)\/\/\s*-{3,}\s+(\S.*?\S|\S)\s+-{3,}\s*$/;
const ASYMMETRIC_RE = /^(\s*)\/\/\s+--\s+(\S.*?\S|\S)\s+-{3,}\s*$/;
const BLOCK_BOX_TOP_RE = /^(\s*)\/\*\s*(-{8,}|={8,})\s*$/;
const BLOCK_BOX_BOTTOM_RE = /^\s*(-{8,}|={8,})\s*\*\/\s*$/;
const FOLDABLE_RE = /(\bhelpers?\b|\bsub-function\b|\btype guards?\b|\btypes?\b|\bstyles?\b|\bgetters?\b)/i;
const OPT_OUT_MARKER = '// separator-sweep: skip';

type CommentStyle = 'line' | 'block';

type Replacement = {
  startLine: number;
  endLine: number;
  indent: string;
  label: string;
  kind: 'heading' | 'region';
  style: CommentStyle;
};

/** Return true when a separator label signals a supporting/collapsible section that should become a region fold. */
export function isFoldable(label: string): boolean {
  return FOLDABLE_RE.test(label);
}

/** Rewrite every recognized separator in the source to its canonical inline-heading or region-fold form. */
export function transformFile(source: string): string {
  if (source.includes(OPT_OUT_MARKER)) return source;

  const lines = source.split('\n');
  const replacements = findReplacements(lines);
  if (replacements.length === 0) return source;

  const regionEnds = resolveRegionEnds(replacements, lines.length);
  return emitOutput(lines, replacements, regionEnds);
}

/** Scan the source lines for every separator form and return a positional record of each match. */
function findReplacements(lines: string[]): Replacement[] {
  const out: Replacement[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';

    const boxMatch = line.match(BOX_LINE_RE);
    if (boxMatch && i + 2 < lines.length) {
      const indent = boxMatch[1] ?? '';
      const bar = (boxMatch[2] ?? '')[0] ?? '';
      const labelMatch = (lines[i + 1] ?? '').match(/^\s*\/\/\s*(\S.*?)\s*$/);
      const bottomMatch = (lines[i + 2] ?? '').match(BOX_LINE_RE);
      if (labelMatch && bottomMatch && bottomMatch[1] === indent && (bottomMatch[2] ?? '')[0] === bar) {
        const label = labelMatch[1] ?? '';
        out.push({
          startLine: i,
          endLine: i + 2,
          indent,
          label,
          kind: isFoldable(label) ? 'region' : 'heading',
          style: 'line',
        });
        i += 3;
        continue;
      }
    }

    const blockTopMatch = line.match(BLOCK_BOX_TOP_RE);
    if (blockTopMatch && i + 2 < lines.length) {
      const indent = blockTopMatch[1] ?? '';
      const bar = (blockTopMatch[2] ?? '')[0] ?? '';
      const labelMatch = (lines[i + 1] ?? '').match(/^\s*(\S.*?)\s*$/);
      const bottomMatch = (lines[i + 2] ?? '').match(BLOCK_BOX_BOTTOM_RE);
      if (labelMatch && bottomMatch && (bottomMatch[1] ?? '')[0] === bar) {
        const label = labelMatch[1] ?? '';
        out.push({
          startLine: i,
          endLine: i + 2,
          indent,
          label,
          kind: isFoldable(label) ? 'region' : 'heading',
          style: 'block',
        });
        i += 3;
        continue;
      }
    }

    const symMatch = line.match(SYMMETRIC_RE);
    if (symMatch) {
      const label = symMatch[2] ?? '';
      out.push({
        startLine: i,
        endLine: i,
        indent: symMatch[1] ?? '',
        label,
        kind: isFoldable(label) ? 'region' : 'heading',
        style: 'line',
      });
      i += 1;
      continue;
    }

    const asymMatch = line.match(ASYMMETRIC_RE);
    if (asymMatch) {
      const label = asymMatch[2] ?? '';
      out.push({
        startLine: i,
        endLine: i,
        indent: asymMatch[1] ?? '',
        label,
        kind: isFoldable(label) ? 'region' : 'heading',
        style: 'line',
      });
      i += 1;
      continue;
    }

    i += 1;
  }
  return out;
}

/** For each region replacement, determine the line before which its endregion marker should be inserted. */
function resolveRegionEnds(replacements: Replacement[], totalLines: number): Map<number, number> {
  const ends = new Map<number, number>();
  for (let idx = 0; idx < replacements.length; idx += 1) {
    const r = replacements[idx];
    if (!r || r.kind !== 'region') continue;
    let endBefore = totalLines;
    for (let j = idx + 1; j < replacements.length; j += 1) {
      const next = replacements[j];
      if (next && next.indent === r.indent) {
        endBefore = next.startLine;
        break;
      }
    }
    ends.set(r.startLine, endBefore);
  }
  return ends;
}

/** Produce the rewritten source by walking the original lines, swapping separator blocks for canonical output, and inserting endregion markers. */
function emitOutput(lines: string[], replacements: Replacement[], regionEnds: Map<number, number>): string {
  const byStart = new Map(replacements.map((r) => [r.startLine, r]));
  const endregionInsertions = new Map<number, string>();
  for (const r of replacements) {
    if (r.kind !== 'region') continue;
    const insertBefore = regionEnds.get(r.startLine) ?? lines.length;
    endregionInsertions.set(insertBefore, formatEndRegion(r));
  }

  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const pendingEnd = endregionInsertions.get(i);
    if (pendingEnd !== undefined) {
      trimTrailingBlankLines(out);
      out.push('');
      out.push(pendingEnd);
      out.push('');
    }
    const r = byStart.get(i);
    if (r) {
      out.push(formatReplacement(r));
      i = r.endLine + 1;
      continue;
    }
    out.push(lines[i] ?? '');
    i += 1;
  }

  const pendingAtEof = endregionInsertions.get(lines.length);
  if (pendingAtEof !== undefined) {
    trimTrailingBlankLines(out);
    out.push('');
    out.push(pendingAtEof);
  }

  return out.join('\n');
}

/** Render a replacement as its canonical single line, respecting the line-vs-block comment style. */
function formatReplacement(r: Replacement): string {
  if (r.kind === 'region') {
    return r.style === 'block' ? `${r.indent}/* region | ${r.label} */` : `${r.indent}// region | ${r.label}`;
  }
  return r.style === 'block' ? `${r.indent}/* -- ${r.label} -- */` : `${r.indent}// -- ${r.label} --`;
}

/** Render the endregion marker that matches a given region replacement. */
function formatEndRegion(r: Replacement): string {
  return r.style === 'block' ? `${r.indent}/* endregion | ${r.label} */` : `${r.indent}// endregion | ${r.label}`;
}

/** Remove any blank strings from the tail of the array in place. */
function trimTrailingBlankLines(arr: string[]): void {
  while (arr.length > 0 && arr[arr.length - 1] === '') arr.pop();
}

// region | Helpers for CLI

/** CLI entry point: sweep the matching files, writing (or printing a diff of) the canonical-form result for each changed file. */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const globIdx = args.indexOf('--glob');
  const explicit = globIdx >= 0 ? args[globIdx + 1] : undefined;
  const patterns = explicit ? [explicit] : ['packages/**/*.{ts,tsx,js,jsx}', 'config/**/*.ts', 'scripts/**/*.ts'];

  const files = await glob(patterns, {
    ignore: ['**/node_modules/**', '**/dist/**'],
  });

  let changedCount = 0;
  for (const file of files.sort()) {
    const original = await readFile(file, 'utf8');
    const transformed = transformFile(original);
    if (transformed === original) continue;
    changedCount += 1;
    if (dryRun) {
      console.log(`--- ${file}`);
      printDiff(original, transformed);
    } else {
      await writeFile(file, transformed);
      console.log(`rewrote ${file}`);
    }
  }
  console.log(`${dryRun ? 'would change' : 'changed'} ${changedCount} file(s)`);
}

/** Print a minimal positional unified diff between two source strings to stdout. */
function printDiff(before: string, after: string): void {
  const beforeLines = before.split('\n');
  const afterLines = after.split('\n');
  const max = Math.max(beforeLines.length, afterLines.length);
  for (let i = 0; i < max; i += 1) {
    const b = beforeLines[i];
    const a = afterLines[i];
    if (b === a) continue;
    if (b !== undefined) console.log(`- ${b}`);
    if (a !== undefined) console.log(`+ ${a}`);
  }
}
// endregion | Helpers for CLI

const entryFile = path.resolve(process.argv[1] ?? '');
const thisFile = path.resolve(new URL(import.meta.url).pathname);
if (entryFile === thisFile) {
  await main();
}
