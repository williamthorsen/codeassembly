import type {
  Action,
  AgentLogicConfig,
  AmbientSpan,
  ElementMeta,
  Finding,
  Span,
  StateConfig,
  TransitionConfig,
} from '../schema/agent-logic-schema.ts';
import { formatPath, type Problem } from '../schema/validate-config.ts';
import { findCommentSpans } from '../source/find-comment-spans.ts';
import { findOccurrences } from '../source/find-occurrences.ts';
import type { Draft, DraftAction, DraftFinding, DraftMeta, DraftState, DraftTransition } from './draft-schema.ts';
import { findGateSpans } from './find-gate-spans.ts';
import { formatStateName } from './format-state-name.ts';

/** The number of characters of a gate's first line by which a problem names it. */
const GATE_NAME_LENGTH = 60;

export type ResolveResult = { ok: true; config: AgentLogicConfig } | { ok: false; problems: Problem[] };

/**
 * Turns a draft into a config by replacing each quote with its span in the prompt, giving each state its key as its
 * id, and naming each state, the root included, by its key or id written as words. Reports every quote that does not
 * occur in the prompt exactly once, every unconverted, ambient, or finding quote that lies inside an HTML comment, which
 * is markup rather than logic, every `<HARD-GATE>` body that no element, ambient, or unconverted quote overlaps, and
 * every gate flag on a quote that overlaps no gate body.
 */
export function resolveQuotes(draft: Draft, prompt: string, rootId: string): ResolveResult {
  const problems: Problem[] = [];
  const comments = findCommentSpans(prompt);
  // Record each quote that resolved to one span, and each gate flag with the path at which a problem would point.
  const quoted: Span[] = [];
  const flagged: { span: Span; path: PropertyKey[] }[] = [];

  /**
   * Resolves a quote to its span. A quote of a `list` must not lie inside a comment, and a finding's quote does not
   * count as quoting a gate, because a finding holds no logic.
   */
  function resolveSpan(
    quote: string,
    path: PropertyKey[],
    list?: 'meta.ambient' | 'meta.findings' | 'meta.unconverted',
  ): Span {
    const starts = findOccurrences(prompt, quote);
    const [start] = starts;
    if (start === undefined) {
      problems.push({
        path: formatPath(path),
        message: `The quote "${quote}" does not occur in the prompt. Copy it verbatim.`,
      });
      return { start: 0, end: 0 };
    }
    if (starts.length > 1) {
      problems.push({
        path: formatPath(path),
        message: `The quote "${quote}" occurs ${starts.length} times in the prompt. Lengthen it until it occurs once.`,
      });
    }
    const span = { start, end: start + quote.length };
    if (starts.length === 1 && list !== 'meta.findings') quoted.push(span);
    if (list !== undefined && starts.length === 1 && comments.some((comment) => contains(comment, span))) {
      problems.push({
        path: formatPath(path),
        message: `The quote "${quote}" lies inside an HTML comment, which is not logic. Leave it out of ${list}.`,
      });
    }
    return span;
  }

  function resolveAmbient(
    ambient: { quote: string; gate?: true | undefined }[] | undefined,
    path: PropertyKey[],
  ): AmbientSpan[] | undefined {
    return ambient?.map(({ quote, gate }, index) => {
      const span = resolveSpan(quote, [...path, 'meta', 'ambient', index, 'quote'], 'meta.ambient');
      if (gate !== true) return span;
      flagged.push({ span, path: [...path, 'meta', 'ambient', index, 'gate'] });
      return { ...span, gate };
    });
  }

  function resolveFindings(findings: DraftFinding[] | undefined, path: PropertyKey[]): Finding[] | undefined {
    return findings?.map(({ kind, quotes, reason }, index) => ({
      kind,
      sources: quotes.map((quote, quoteIndex) =>
        resolveSpan(quote, [...path, 'meta', 'findings', index, 'quotes', quoteIndex], 'meta.findings'),
      ),
      reason,
    }));
  }

  function resolveActions(actions: DraftAction[] | undefined, path: PropertyKey[]): Action[] | undefined {
    return actions?.map(({ meta, ...action }, index) => {
      if (meta === undefined) return action;
      const source = resolveSpan(meta.quote, [...path, index, 'meta', 'quote']);
      flagged.push({ span: source, path: [...path, index, 'meta', 'gate'] });
      return { ...action, meta: { source, gate: meta.gate } };
    });
  }

  function resolveMeta(meta: DraftMeta, path: PropertyKey[]): ElementMeta {
    const source = resolveSpan(meta.quote, [...path, 'meta', 'quote']);
    const ambient = resolveAmbient(meta.ambient, path);
    const findings = resolveFindings(meta.findings, path);
    if (meta.gate === true) flagged.push({ span: source, path: [...path, 'meta', 'gate'] });
    return {
      source,
      ...(meta.inferred === true && { inferred: true }),
      ...(meta.gate === true && { gate: true }),
      ...(ambient !== undefined && { ambient }),
      ...(findings !== undefined && { findings }),
    };
  }

  function resolveTransition({ actions, ...transition }: DraftTransition, path: PropertyKey[]): TransitionConfig {
    const resolvedActions = resolveActions(actions, [...path, 'actions']);
    return {
      ...transition,
      ...(resolvedActions !== undefined && { actions: resolvedActions }),
      meta: resolveMeta(transition.meta, path),
    };
  }

  function resolveTransitions(
    transitions: DraftTransition | DraftTransition[],
    path: PropertyKey[],
  ): TransitionConfig | TransitionConfig[] {
    if (!Array.isArray(transitions)) return resolveTransition(transitions, path);
    return transitions.map((transition, index) => resolveTransition(transition, [...path, index]));
  }

  function resolveChildren(states: Record<string, DraftState>, path: PropertyKey[]): Record<string, StateConfig> {
    return Object.fromEntries(
      Object.entries(states).map(([key, child]) => [key, resolveState(key, child, [...path, 'states', key])]),
    );
  }

  function resolveEvents(
    on: Record<string, DraftTransition | DraftTransition[]>,
    path: PropertyKey[],
  ): Record<string, TransitionConfig | TransitionConfig[]> {
    return Object.fromEntries(
      Object.entries(on).map(([event, transitions]) => [
        event,
        resolveTransitions(transitions, [...path, 'on', event]),
      ]),
    );
  }

  function resolveState(key: string, state: DraftState, path: PropertyKey[]): StateConfig {
    const { on, always, states, entry, exit, meta, ...rest } = state;
    const name = formatStateName(key);
    return {
      ...rest,
      id: key,
      entry: resolveActions(entry, [...path, 'entry']),
      exit: resolveActions(exit, [...path, 'exit']),
      on: on === undefined ? undefined : resolveEvents(on, path),
      always: always === undefined ? undefined : resolveTransitions(always, [...path, 'always']),
      states: states === undefined ? undefined : resolveChildren(states, path),
      meta: { ...(name !== undefined && { name }), ...resolveMeta(meta, path) },
    };
  }

  const rootName = formatStateName(rootId);
  const config: AgentLogicConfig = {
    id: rootId,
    initial: draft.initial,
    entry: resolveActions(draft.entry, ['entry']),
    exit: resolveActions(draft.exit, ['exit']),
    on: draft.on === undefined ? undefined : resolveEvents(draft.on, []),
    always: draft.always === undefined ? undefined : resolveTransitions(draft.always, ['always']),
    states: resolveChildren(draft.states, []),
    meta: {
      ...(rootName !== undefined && { name: rootName }),
      prompt,
      source: { start: 0, end: prompt.length },
      unconverted: draft.meta.unconverted.map(({ quote, reason }, index) => ({
        ...resolveSpan(quote, ['meta', 'unconverted', index, 'quote'], 'meta.unconverted'),
        reason,
      })),
      ...(draft.meta.ambient !== undefined && { ambient: resolveAmbient(draft.meta.ambient, []) }),
      ...(draft.meta.findings !== undefined && { findings: resolveFindings(draft.meta.findings, []) }),
    },
  };

  checkGates(prompt, quoted, flagged, problems);
  return problems.length === 0 ? { ok: true, config } : { ok: false, problems };
}

// region | Helpers
/**
 * Reports each gate body that no quote overlaps, naming it by its first words, and each gate flag whose quote overlaps
 * no gate body.
 */
function checkGates(
  prompt: string,
  quoted: Span[],
  flagged: { span: Span; path: PropertyKey[] }[],
  problems: Problem[],
): void {
  const gates = findGateSpans(prompt);
  for (const gate of gates) {
    if (quoted.some((span) => overlaps(span, gate))) continue;
    problems.push({
      path: '',
      message: `The gate "${describeGate(prompt.slice(gate.start, gate.end))}" is not quoted by any element, ambient instruction, or unconverted passage. Represent it as the extraction rules' Gates section states.`,
    });
  }
  for (const { span, path } of flagged) {
    // A quote that did not resolve is already reported.
    if (span.end === 0 || gates.some((gate) => overlaps(span, gate))) continue;
    problems.push({
      path: formatPath(path),
      message: `The quote "${prompt.slice(span.start, span.end)}" lies outside every <HARD-GATE> body. Remove "gate", or quote the gate.`,
    });
  }
}

/** Reports whether the outer span contains the inner one. */
function contains(outer: Span, inner: Span): boolean {
  return outer.start <= inner.start && inner.end <= outer.end;
}

/** Returns the first line of a gate's body, cut at the last word boundary within `GATE_NAME_LENGTH` characters. */
function describeGate(body: string): string {
  const [firstLine = ''] = body.split('\n', 1);
  if (firstLine.length <= GATE_NAME_LENGTH) return firstLine;
  const cut = firstLine.lastIndexOf(' ', GATE_NAME_LENGTH);
  return `${firstLine.slice(0, cut === -1 ? GATE_NAME_LENGTH : cut)}…`;
}

/** Returns whether two half-open spans share any offset. */
function overlaps(first: Span, second: Span): boolean {
  return first.start < second.end && second.start < first.end;
}
// endregion | Helpers
