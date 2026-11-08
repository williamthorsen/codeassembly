import type { core } from 'zod';

import {
  type Action,
  type AgentLogicConfig,
  agentLogicConfigSchema,
  type Finding,
  type Span,
} from './agent-logic-schema.ts';
import { listStates, listTransitions, type StateEntry, type StateLike } from './config-traversal.ts';

export interface Problem {
  /** Where the problem is, as a dotted path into the config; empty for the root. */
  path: string;
  message: string;
}

export type ValidationResult = { ok: true; config: AgentLogicConfig } | { ok: false; problems: Problem[] };

/** Formats a path into the config as dotted segments, bracketing a key that contains a dot. */
export function formatPath(path: readonly PropertyKey[]): string {
  return path
    .map((segment, index) => {
      if (typeof segment === 'number') return `[${segment}]`;
      const key = String(segment);
      if (key.includes('.')) return `["${key}"]`;
      return index === 0 ? key : `.${key}`;
    })
    .join('');
}

/** Checks a value against the schema, then against the rules that the schema cannot express. */
export function validateConfig(value: unknown): ValidationResult {
  const parsed = agentLogicConfigSchema.safeParse(value);
  if (!parsed.success) {
    return {
      ok: false,
      problems: parsed.error.issues.map((issue) => ({ path: formatPath(issue.path), message: describeIssue(issue) })),
    };
  }

  const problems = findSemanticProblems(parsed.data);
  return problems.length === 0 ? { ok: true, config: parsed.data } : { ok: false, problems };
}

// region | Helpers
function describeIssue(issue: core.$ZodIssue): string {
  if (issue.code === 'unrecognized_keys') {
    return `Unrecognized ${issue.keys.length === 1 ? 'key' : 'keys'}: ${issue.keys.join(', ')}. Remove ${issue.keys.length === 1 ? 'it' : 'them'}.`;
  }
  return `${issue.message}.`;
}

/** Checks that the span of each gated action lies in the prompt. */
function checkActionSpans(
  actions: Action[] | undefined,
  promptLength: number,
  path: PropertyKey[],
  problems: Problem[],
): void {
  const entries = (actions ?? []).entries();
  for (const [index, action] of entries) {
    if (action.meta !== undefined)
      checkSpan(action.meta.source, promptLength, [...path, index, 'meta', 'source'], problems);
  }
}

/**
 * Checks that ambient spans sit on the root or a compound state, lie in the prompt, and overlap neither each other nor
 * an unconverted span.
 */
function checkAmbient(config: AgentLogicConfig, states: StateEntry[], problems: Problem[]): void {
  const promptLength = config.meta.prompt.length;
  const placed: Span[] = [];
  for (const { path, state } of states) {
    const ambient = state.meta.ambient;
    if (ambient === undefined) continue;
    if (state.states === undefined) {
      problems.push({
        path: formatPath([...path, 'meta', 'ambient']),
        message:
          'Ambient instructions belong to the root or to a compound state. Move them to the enclosing flow or the root.',
      });
      continue;
    }
    for (const [index, span] of ambient.entries()) {
      const spanPath = [...path, 'meta', 'ambient', index];
      checkSpan(span, promptLength, spanPath, problems);
      if (placed.some((other) => overlaps(other, span))) {
        problems.push({
          path: formatPath(spanPath),
          message: 'The span overlaps another ambient instruction. Give each passage one ambient entry.',
        });
      } else if (config.meta.unconverted.some((other) => overlaps(other, span))) {
        problems.push({
          path: formatPath(spanPath),
          message: 'The span overlaps an unconverted passage. List the passage as ambient or as unconverted, not both.',
        });
      }
      placed.push(span);
    }
  }
}

/**
 * Checks that each finding's spans lie in the prompt and that an `inferred-resolution` finding sits on an inferred
 * element, which the root never is.
 */
function checkFindings(
  findings: Finding[] | undefined,
  isElementInferred: boolean,
  promptLength: number,
  path: PropertyKey[],
  problems: Problem[],
): void {
  if (findings === undefined) return;
  for (const [index, finding] of findings.entries()) {
    const findingPath = [...path, 'meta', 'findings', index];
    for (const [sourceIndex, span] of finding.sources.entries()) {
      checkSpan(span, promptLength, [...findingPath, 'sources', sourceIndex], problems);
    }
    if (finding.kind === 'inferred-resolution' && !isElementInferred) {
      problems.push({
        path: formatPath([...findingPath, 'kind']),
        message:
          'An inferred-resolution finding explains an inferred element, and this one is not. Move it to the inferred element that it explains, or change its kind.',
      });
    }
  }
}

function checkInitial(path: PropertyKey[], state: StateLike, problems: Problem[]): void {
  const childKeys = Object.keys(state.states ?? {});
  if (childKeys.length > 0 && state.initial === undefined) {
    problems.push({
      path: formatPath([...path, 'initial']),
      message: `The state has children but no initial state. Set "initial" to one of: ${childKeys.join(', ')}.`,
    });
  } else if (state.initial !== undefined && !childKeys.includes(state.initial)) {
    problems.push({
      path: formatPath([...path, 'initial']),
      message:
        childKeys.length === 0
          ? `"initial" names "${state.initial}", but the state has no children. Remove "initial".`
          : `"initial" names "${state.initial}", which is not a child state. Name one of: ${childKeys.join(', ')}.`,
    });
  }
}

function checkSpan(span: Span, promptLength: number, path: PropertyKey[], problems: Problem[]): void {
  if (span.start > span.end) {
    problems.push({
      path: formatPath(path),
      message: `The span starts at ${span.start}, after its end at ${span.end}. Swap or correct the offsets.`,
    });
  } else if (span.end > promptLength) {
    problems.push({
      path: formatPath(path),
      message: `The span ends at ${span.end}, past the prompt's last offset, ${promptLength}. Correct the offsets.`,
    });
  }
}

function checkUniqueIds(states: StateEntry[], problems: Problem[]): void {
  const pathsById = Map.groupBy(states, ({ state }) => state.id);
  for (const [id, entries] of pathsById) {
    const [, duplicate] = entries;
    if (duplicate !== undefined) {
      problems.push({
        path: formatPath([...duplicate.path, 'id']),
        message: `The id "${id}" is used by ${entries.length} states. Give each state its own id.`,
      });
    }
  }
}

/** Returns the id closest to the missing one by edit distance, if within a third of its length; ties go to the first. */
function findNearestId(missingId: string, ids: Iterable<string>): string | undefined {
  const threshold = Math.max(1, Math.floor(missingId.length / 3));
  let nearest: { id: string; distance: number } | undefined;
  for (const id of ids) {
    const distance = measureEditDistance(missingId, id);
    if (distance > threshold || (nearest !== undefined && distance >= nearest.distance)) continue;
    nearest = { id, distance };
  }
  return nearest?.id;
}

function findSemanticProblems(config: AgentLogicConfig): Problem[] {
  const problems: Problem[] = [];
  const states = listStates(config);
  const ids = new Set(states.map(({ state }) => state.id));
  const promptLength = config.meta.prompt.length;

  checkUniqueIds(states, problems);
  for (const [index, span] of config.meta.unconverted.entries()) {
    checkSpan(span, promptLength, ['meta', 'unconverted', index], problems);
  }

  checkAmbient(config, states, problems);

  for (const { path, state } of states) {
    checkSpan(state.meta.source, promptLength, [...path, 'meta', 'source'], problems);
    checkFindings(state.meta.findings, isInferred(state.meta), promptLength, path, problems);
    checkActionSpans(state.entry, promptLength, [...path, 'entry'], problems);
    checkActionSpans(state.exit, promptLength, [...path, 'exit'], problems);
    checkInitial(path, state, problems);
    if ('gate' in state.meta && state.meta.gate === true) {
      problems.push({
        path: formatPath([...path, 'meta', 'gate']),
        message:
          'A state cannot be a gate. Flag the transition into the step, an action of the step, or an ambient instruction.',
      });
    }

    const transitions = listTransitions(state);
    if ('type' in state && state.type === 'final' && (state.states !== undefined || transitions.length > 0)) {
      problems.push({
        path: formatPath([...path, 'type']),
        message: 'A final state cannot have children or transitions. Remove them, or remove "type".',
      });
    }

    for (const { path: transitionPath, transition } of transitions) {
      const fullPath = [...path, ...transitionPath];
      checkSpan(transition.meta.source, promptLength, [...fullPath, 'meta', 'source'], problems);
      checkFindings(transition.meta.findings, isInferred(transition.meta), promptLength, fullPath, problems);
      checkActionSpans(transition.actions, promptLength, [...fullPath, 'actions'], problems);
      if (transition.target === undefined || ids.has(transition.target.slice(1))) continue;
      const nearestId = findNearestId(transition.target.slice(1), ids);
      problems.push({
        path: formatPath([...fullPath, 'target']),
        message:
          nearestId === undefined
            ? `The target "${transition.target}" does not name any state. Use "#" followed by an existing state's id.`
            : `The target "${transition.target}" does not name any state. Use "#${nearestId}" or another existing state's id.`,
      });
    }
  }

  return problems;
}

/** Returns whether an element's meta marks it inferred; the root's meta never does. */
function isInferred(meta: object): boolean {
  return 'inferred' in meta && meta.inferred === true;
}

/** Returns whether two half-open spans share any offset. */
function overlaps(first: Span, second: Span): boolean {
  return first.start < second.end && second.start < first.end;
}

/** Returns the Levenshtein distance between two strings: the fewest insertions, deletions, and substitutions. */
function measureEditDistance(from: string, to: string): number {
  let previousRow = Array.from({ length: to.length + 1 }, (_, index) => index);
  for (let fromIndex = 0; fromIndex < from.length; fromIndex += 1) {
    const row = [fromIndex + 1];
    for (let toIndex = 0; toIndex < to.length; toIndex += 1) {
      row.push(
        Math.min(
          (previousRow[toIndex + 1] ?? 0) + 1,
          (row[toIndex] ?? 0) + 1,
          (previousRow[toIndex] ?? 0) + (from[fromIndex] === to[toIndex] ? 0 : 1),
        ),
      );
    }
    previousRow = row;
  }
  return previousRow[to.length] ?? 0;
}

// endregion | Helpers
