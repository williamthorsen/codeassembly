import {
  describeConfig,
  listGaps,
  type StateDescription,
  type TransitionDescription,
} from '../layout/describe-config.ts';
import type { AgentLogicConfig, Span } from '../schema/agent-logic-schema.ts';
import { listStates, listTransitions } from '../schema/config-traversal.ts';

/** What the scorer measures of a converted prompt. */
export interface ChartScore {
  states: number;
  transitions: number;
  inferred: number;
  unconverted: number;
  /** The ambient instructions of the root and of every flow. */
  ambient: number;
  /** The gaps that the viewer reports, each as the element and the kind that the viewer shows. */
  reportedGaps: string[];
  /**
   * The share of the prompt's non-whitespace characters inside a used, ambient, or unconverted span, a gated action's
   * included, from 0 to 1.
   */
  coverage: number;
}

/** Measures a converted prompt's chart. */
export function scoreChart(prompt: string, config: AgentLogicConfig): ChartScore {
  const states = listStates(config).slice(1);
  const transitions = listStates(config).flatMap(({ state }) => listTransitions(state));
  const elementSpans = [
    ...states.map(({ state }) => state.meta.source),
    ...transitions.map(({ transition }) => transition.meta.source),
  ];
  const description = describeConfig(config);
  return {
    states: states.length,
    transitions: transitions.length,
    inferred: [
      ...states.map(({ state }) => state.meta),
      ...transitions.map(({ transition }) => transition.meta),
    ].filter((meta) => 'inferred' in meta && meta.inferred === true).length,
    unconverted: config.meta.unconverted.length,
    ambient: description.ambient.length,
    reportedGaps: listGaps(description).flatMap(describeGapLines),
    coverage: measureCoverage(prompt, [
      ...elementSpans,
      ...[
        ...description.states.flatMap(({ entry, exit }) => [...entry, ...exit]),
        ...description.transitions.flatMap(({ actions }) => actions),
      ].flatMap(({ source }) => (source === undefined ? [] : [source])),
      ...description.ambient.map(({ source }) => source),
      ...config.meta.unconverted,
    ]),
  };
}

// region | Helpers
/** Returns a line per gap of a state or transition, naming the element and the gap. */
function describeGapLines(element: StateDescription | TransitionDescription): string[] {
  if (element.kind === 'transition') return [`\`${element.path}\`: no alternative`];
  const lines: string[] = [];
  if (element.hasNoExit) lines.push(`\`${element.id}\`: no exit`);
  if (element.isUnreachable) lines.push(`\`${element.id}\`: unreachable`);
  return lines;
}

/** Returns the share of the prompt's non-whitespace characters that lie inside at least one span. */
function measureCoverage(prompt: string, spans: Span[]): number {
  const covered = Array.from({ length: prompt.length }, () => false);
  for (const { start, end } of spans) covered.fill(true, start, end);
  let total = 0;
  let inside = 0;
  // Index by UTF-16 code unit, as spans do.
  for (let index = 0; index < prompt.length; index += 1) {
    if (/\s/.test(prompt.charAt(index))) continue;
    total += 1;
    if (covered[index] === true) inside += 1;
  }
  return total === 0 ? 0 : inside / total;
}
// endregion | Helpers
