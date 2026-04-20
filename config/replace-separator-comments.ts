#!/usr/bin/env tsx
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { glob } from 'glob';

const BOX_LINE_RE = /^(\s*)\/\/\s*(-{8,}|={8,})\s*$/;
const SYMMETRIC_RE = /^(\s*)\/\/\s*-{3,}\s+(\S.*?\S|\S)\s+-{3,}\s*$/;
const ASYMMETRIC_RE = /^(\s*)\/\/\s+--\s+(\S.*?\S|\S)\s+-{3,}\s*$/;
const FOLDABLE_RE = /(\bhelpers?\b|\bsub-function\b|\btype guards?\b|\btypes?\b|\bstyles?\b|\bgetters?\b)/i;
const OPT_OUT_MARKER = '// separator-sweep: skip';

type Replacement = {
  startLine: number;
  endLine: number;
  indent: string;
  label: string;
  kind: 'heading' | 'region';
};

export function isFoldable(label: string): boolean {
  return FOLDABLE_RE.test(label);
}

export function transformFile(source: string): string {
  if (source.includes(OPT_OUT_MARKER)) return source;

  const lines = source.split('\n');
  const replacements = findReplacements(lines);
  if (replacements.length === 0) return source;

  const regionEnds = resolveRegionEnds(replacements, lines.length);
  return emitOutput(lines, replacements, regionEnds);
}

function findReplacements(lines: string[]): Replacement[] {
  const out: Replacement[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const boxMatch = line.match(BOX_LINE_RE);
    if (boxMatch && i + 2 < lines.length) {
      const indent = boxMatch[1];
      const bar = boxMatch[2][0]; // '-' or '='
      const labelLine = lines[i + 1];
      const bottomLine = lines[i + 2];
      const labelMatch = labelLine.match(/^\s*\/\/\s*(\S.*?)\s*$/);
      const bottomMatch = bottomLine.match(BOX_LINE_RE);
      if (labelMatch && bottomMatch && bottomMatch[1] === indent && bottomMatch[2][0] === bar) {
        out.push({
          startLine: i,
          endLine: i + 2,
          indent,
          label: labelMatch[1],
          kind: isFoldable(labelMatch[1]) ? 'region' : 'heading',
        });
        i += 3;
        continue;
      }
    }

    const symMatch = line.match(SYMMETRIC_RE);
    if (symMatch) {
      out.push({
        startLine: i,
        endLine: i,
        indent: symMatch[1],
        label: symMatch[2],
        kind: isFoldable(symMatch[2]) ? 'region' : 'heading',
      });
      i += 1;
      continue;
    }

    const asymMatch = line.match(ASYMMETRIC_RE);
    if (asymMatch) {
      out.push({
        startLine: i,
        endLine: i,
        indent: asymMatch[1],
        label: asymMatch[2],
        kind: isFoldable(asymMatch[2]) ? 'region' : 'heading',
      });
      i += 1;
      continue;
    }

    i += 1;
  }
  return out;
}

function resolveRegionEnds(replacements: Replacement[], totalLines: number): Map<number, number> {
  const ends = new Map<number, number>();
  for (let idx = 0; idx < replacements.length; idx += 1) {
    const r = replacements[idx];
    if (r.kind !== 'region') continue;
    let endBefore = totalLines;
    for (let j = idx + 1; j < replacements.length; j += 1) {
      if (replacements[j].indent === r.indent) {
        endBefore = replacements[j].startLine;
        break;
      }
    }
    ends.set(r.startLine, endBefore);
  }
  return ends;
}

function emitOutput(lines: string[], replacements: Replacement[], regionEnds: Map<number, number>): string {
  const byStart = new Map(replacements.map((r) => [r.startLine, r]));
  const endregionInsertions = new Map<number, string>();
  for (const r of replacements) {
    if (r.kind !== 'region') continue;
    const insertBefore = regionEnds.get(r.startLine) ?? lines.length;
    endregionInsertions.set(insertBefore, `${r.indent}// endregion | ${r.label}`);
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
      const replacement = r.kind === 'region' ? `${r.indent}// region | ${r.label}` : `${r.indent}// -- ${r.label} --`;
      out.push(replacement);
      i = r.endLine + 1;
      continue;
    }
    out.push(lines[i]);
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

function trimTrailingBlankLines(arr: string[]): void {
  while (arr.length > 0 && arr[arr.length - 1] === '') arr.pop();
}

// region | Helpers for CLI
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const globIdx = args.indexOf('--glob');
  const patterns = globIdx >= 0 ? [args[globIdx + 1]] : ['packages/**/*.{ts,tsx,js,jsx}', 'config/**/*.ts'];

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
