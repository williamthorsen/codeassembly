import { dirname, isAbsolute, resolve } from 'node:path';

import type { Finding } from '@codeassembly/kb';
import type { EnumeratedNote } from '@codeassembly/kb/check';

/** A note's resolved supersession edges, keyed by absolute path. */
interface SupersedeNode {
  /** The absolute path of the note that supersedes this one, resolved from `superseded-by`; `null` when absent. */
  supersededBy: string | null;
  /** The absolute path of the note this one supersedes, resolved from `supersedes`; `null` when absent. */
  supersedes: string | null;
}

/**
 * Validates the vault-wide supersede graph built from every note's `superseded-by` and `supersedes` fields
 * (resolved relative to the referring note's directory). Emits:
 *
 * - `supersede.dangling` (error) — a `superseded-by` or `supersedes` target that is not a note in the vault.
 * - `supersede.cycle` (error) — a cycle reachable by following `superseded-by` edges, reported on each member.
 * - `supersede.asymmetric` (warning) — `A.superseded-by → B` without the matching `B.supersedes → A`.
 *
 * Findings are returned in vault order (the order `notes` was enumerated in).
 */
export function detectSupersede(notes: readonly EnumeratedNote[]): Finding[] {
  const present = new Set(notes.map((note) => note.path));
  const graph = new Map<string, SupersedeNode>();
  for (const note of notes) {
    graph.set(note.path, {
      supersededBy: resolveRef(note, 'superseded-by'),
      supersedes: resolveRef(note, 'supersedes'),
    });
  }

  const findings: Finding[] = [];
  for (const note of notes) {
    findings.push(
      ...danglingFindings({ path: note.path, node: graph.get(note.path), present }),
      ...asymmetricFindings({ path: note.path, graph }),
    );
  }
  findings.push(...cycleFindings({ notes, graph }));
  return findings;
}

// region | Helpers

/** Reports a dangling `superseded-by` or `supersedes` target that does not resolve to a vault note. */
function danglingFindings(input: {
  path: string;
  node: SupersedeNode | undefined;
  present: ReadonlySet<string>;
}): Finding[] {
  const { path, node, present } = input;
  if (node === undefined) return [];
  const findings: Finding[] = [];
  if (node.supersededBy !== null && !present.has(node.supersededBy)) {
    findings.push({
      path,
      rule: 'supersede.dangling',
      severity: 'error',
      message: `superseded-by target does not resolve to a vault note: ${node.supersededBy}`,
    });
  }
  if (node.supersedes !== null && !present.has(node.supersedes)) {
    findings.push({
      path,
      rule: 'supersede.dangling',
      severity: 'error',
      message: `supersedes target does not resolve to a vault note: ${node.supersedes}`,
    });
  }
  return findings;
}

/** Reports an asymmetric edge: `A.superseded-by → B` without the matching `B.supersedes → A`. */
function asymmetricFindings(input: { path: string; graph: ReadonlyMap<string, SupersedeNode> }): Finding[] {
  const { path, graph } = input;
  const node = graph.get(path);
  if (node === undefined || node.supersededBy === null) return [];
  const successor = graph.get(node.supersededBy);
  // A dangling target is reported separately; only flag asymmetry when the successor exists in the graph.
  if (successor === undefined) return [];
  if (successor.supersedes === path) return [];
  return [
    {
      path,
      rule: 'supersede.asymmetric',
      severity: 'warning',
      message: `superseded-by points to ${node.supersededBy}, but that note's supersedes does not point back here`,
    },
  ];
}

/**
 * Detects cycles reachable by following `superseded-by` edges, using a DFS coloring walk. Each note found on a cycle
 * gets one `supersede.cycle` finding. Edges to notes outside the vault terminate the walk (a dangling edge cannot
 * close a cycle).
 */
function cycleFindings(input: {
  notes: readonly EnumeratedNote[];
  graph: ReadonlyMap<string, SupersedeNode>;
}): Finding[] {
  const { notes, graph } = input;
  const onCycle = new Set<string>();
  // The supersede graph is functional: each note has at most one outgoing `superseded-by` edge, so every walk
  // follows a unique successor chain. A node is only ever marked `visited` by the walk that follows that chain, and
  // if the chain contains a cycle the `onStack` check below catches it within the same walk. A real cycle therefore
  // cannot be skipped by the shared `visited` set, so a single shared set is safe here (no two-color DFS needed).
  const visited = new Set<string>();

  for (const note of notes) {
    if (visited.has(note.path)) continue;
    const stack: string[] = [];
    const onStack = new Set<string>();
    let current: string | null = note.path;
    while (current !== null && graph.has(current)) {
      if (onStack.has(current)) {
        // Mark the cycle from the first occurrence of `current` to the top of the stack.
        for (let index = stack.indexOf(current); index < stack.length; index += 1) {
          const member = stack[index];
          if (member !== undefined) onCycle.add(member);
        }
        break;
      }
      if (visited.has(current)) break;
      visited.add(current);
      stack.push(current);
      onStack.add(current);
      current = graph.get(current)?.supersededBy ?? null;
    }
  }

  const findings: Finding[] = [];
  for (const note of notes) {
    if (onCycle.has(note.path)) {
      findings.push({
        path: note.path,
        rule: 'supersede.cycle',
        severity: 'error',
        message: 'note participates in a superseded-by cycle',
      });
    }
  }
  return findings;
}

/** Resolves a `superseded-by`/`supersedes` reference to an absolute path against the note's directory; `null` when absent. */
function resolveRef(note: EnumeratedNote, key: 'superseded-by' | 'supersedes'): string | null {
  const raw = note.fields[key];
  if (typeof raw !== 'string' || raw.trim() === '') {
    return null;
  }
  const ref = raw.trim();
  return isAbsolute(ref) ? ref : resolve(dirname(note.path), ref);
}

// endregion | Helpers
