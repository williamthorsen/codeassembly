import type { ActionDescription } from '../../layout/describe-config.ts';
import type { FlowElements } from '../../layout/to-flow-elements.ts';

/** A kind of element that the canvas marks and that its key names. */
export type ChartMark =
  | 'any-time'
  | 'ends'
  | 'fallback'
  | 'gate'
  | 'inferred'
  | 'no-alternative'
  | 'no-exit'
  | 'starts-here'
  | 'unreachable'
  | 'waits-for-user';

/** Returns the marks that the laid-out chart draws, so that its key names only those. */
export function listChartMarks({ nodes, edges }: FlowElements): Set<ChartMark> {
  const marks = new Set<ChartMark>();
  for (const { data } of nodes) {
    if (data.waitsForUser) marks.add('waits-for-user');
    if (data.isFinal) marks.add('ends');
    if (data.isInitial) marks.add('starts-here');
    if (data.hasNoExit) marks.add('no-exit');
    if (data.isUnreachable) marks.add('unreachable');
    if (data.inferred) marks.add('inferred');
    if (hasGate([...data.entry, ...data.exit]) || data.ambient?.some(({ gate }) => gate) === true) marks.add('gate');
  }
  for (const { data } of edges) {
    if (data === undefined) continue;
    if (data.isGlobal) marks.add('any-time');
    if (data.isFallback) marks.add('fallback');
    if (data.lacksAlternative) marks.add('no-alternative');
    if (data.inferred) marks.add('inferred');
    if (data.gate || hasGate(data.actions)) marks.add('gate');
  }
  return marks;
}

// region | Helpers
/** Returns whether any of the actions represents a `<HARD-GATE>`. */
function hasGate(actions: readonly ActionDescription[]): boolean {
  return actions.some(({ gate }) => gate);
}
// endregion | Helpers
