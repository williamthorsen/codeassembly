/** The `check-evidence` command's checks: whether each proposal's evidence resolves against the current tree. */
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import type { Evidence, Proposal, SenseDocument } from './schemas.ts';

/** A proposal that failed, with the first reason found. */
export interface EvidenceFailure {
  id: string;
  reason: string;
}

/** The ids of the proposals whose evidence resolves, and the failures of the rest. */
export interface EvidenceReport {
  passed: string[];
  failed: EvidenceFailure[];
}

/** Checks every proposal's paths and evidence against the files under `root` and the sensors of `sense`. */
export function checkEvidence(proposals: readonly Proposal[], sense: SenseDocument, root: string): EvidenceReport {
  const okSensors = new Set(sense.sensors.filter((sensor) => sensor.status === 'ok').map((sensor) => sensor.name));
  const report: EvidenceReport = { passed: [], failed: [] };
  for (const proposal of proposals) {
    const reason = findFailure(proposal, okSensors, root);
    if (reason === undefined) report.passed.push(proposal.id);
    else report.failed.push({ id: proposal.id, reason });
  }
  return report;
}

/**
 * Returns the lines of the section whose heading text, without its `#` markers, equals `section`: from the heading to
 * the next heading of the same or a higher level. A `#` line inside a fenced code block is not a heading. Returns
 * undefined when the document does not have the heading.
 */
export function extractSection(markdown: string, section: string): string | undefined {
  const lines = markdown.split('\n');
  const headings = listHeadings(lines);
  const startIndex = headings.findIndex((heading) => heading.text === section);
  const start = headings[startIndex];
  if (start === undefined) return undefined;
  const end = headings.slice(startIndex + 1).find((heading) => heading.level <= start.level);
  return lines.slice(start.line, end?.line ?? lines.length).join('\n');
}

// region | Helpers

/** Collapses every run of whitespace to one space, so that a quote matches across line wrapping. */
function collapseWhitespace(text: string): string {
  return text.replaceAll(/\s+/g, ' ').trim();
}

/** Returns why one evidence entry does not resolve, or undefined when it does. */
function findEvidenceFailure(evidence: Evidence, okSensors: ReadonlySet<string>, root: string): string | undefined {
  switch (evidence.kind) {
    case 'span': {
      const text = readTextFile(root, evidence.path);
      if (text === undefined) return `span path ${evidence.path} does not exist`;
      const lines = text.split('\n');
      if (evidence.startLine > evidence.endLine || evidence.endLine > lines.length) {
        return `span ${evidence.path}:${evidence.startLine}-${evidence.endLine} is outside the file's ${lines.length} lines`;
      }
      const range = lines.slice(evidence.startLine - 1, evidence.endLine).join('\n');
      return collapseWhitespace(range).includes(collapseWhitespace(evidence.quote))
        ? undefined
        : `the quote is not in ${evidence.path}:${evidence.startLine}-${evidence.endLine}`;
    }
    case 'rule': {
      const text = readTextFile(root, evidence.rulebook);
      if (text === undefined) return `rulebook ${evidence.rulebook} does not exist`;
      const body = extractSection(text, evidence.section);
      if (body === undefined) return `rulebook ${evidence.rulebook} does not have the section "${evidence.section}"`;
      return collapseWhitespace(body).includes(collapseWhitespace(evidence.quote))
        ? undefined
        : `the quote is not in section "${evidence.section}" of ${evidence.rulebook}`;
    }
    case 'sensor':
      return okSensors.has(evidence.sensor) ? undefined : `sensor ${evidence.sensor} did not run successfully`;
  }
}

/** Returns the first reason that a proposal fails: a missing path, then its evidence in order. */
function findFailure(proposal: Proposal, okSensors: ReadonlySet<string>, root: string): string | undefined {
  const missing = proposal.paths.find((file) => !existsSync(path.resolve(root, file)));
  if (missing !== undefined) return `path ${missing} does not exist`;
  for (const evidence of proposal.evidence) {
    const reason = findEvidenceFailure(evidence, okSensors, root);
    if (reason !== undefined) return reason;
  }
  return undefined;
}

/** Lists the ATX headings outside fenced code blocks, each with its line index, level, and text. */
function listHeadings(lines: readonly string[]): Array<{ line: number; level: number; text: string }> {
  const headings: Array<{ line: number; level: number; text: string }> = [];
  let fence: string | undefined;
  for (const [index, line] of lines.entries()) {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (fence === undefined && marker !== undefined) {
      fence = marker;
      continue;
    }
    if (fence !== undefined) {
      if (marker !== undefined && marker[0] === fence[0] && marker.length >= fence.length) fence = undefined;
      continue;
    }
    const heading = parseHeading(line);
    if (heading !== undefined) headings.push({ line: index, ...heading });
  }
  return headings;
}

/** Parses an ATX heading into its level and text, or returns undefined for any other line. */
function parseHeading(line: string): { level: number; text: string } | undefined {
  const match = /^(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/.exec(line);
  if (match === null) return undefined;
  const [, hashes = '', text = ''] = match;
  return { level: hashes.length, text };
}

/** Reads a file resolved against `root`, or returns undefined when it is absent or not a regular file. */
function readTextFile(root: string, file: string): string | undefined {
  const absolute = path.resolve(root, file);
  if (!existsSync(absolute) || !statSync(absolute).isFile()) return undefined;
  return readFileSync(absolute, 'utf8');
}

// endregion | Helpers
