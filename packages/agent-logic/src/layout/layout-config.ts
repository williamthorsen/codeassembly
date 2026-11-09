import elkModule from 'elkjs/lib/elk.bundled.js';
import type { ElkNode } from 'elkjs/lib/elk-api.js';

import type { AgentLogicConfig } from '../schema/agent-logic-schema.ts';
import { buildElkGraph, type ElkGraphOptions, HIDDEN_AMBIENT, PREAMBLE_FLOW_WIDTH } from './build-elk-graph.ts';
import { type ConfigDescription, describeConfig } from './describe-config.ts';
import { countPreambleColumns } from './pack-preamble.ts';
import { type FlowElements, toFlowElements } from './to-flow-elements.ts';

// The bundle is CommonJS, so the default import is its `module.exports`, which carries the constructor as `default`.
const elk = new elkModule.default();

/** Lays out a valid config as positioned React Flow nodes and edges. */
export async function layoutConfig(
  config: AgentLogicConfig,
  options: Pick<ElkGraphOptions, 'showAmbient'> = HIDDEN_AMBIENT,
): Promise<FlowElements> {
  const description = describeConfig(config);
  const extraWidths = new Map<string, number>();
  const columnLimits = new Map<string, number>();
  const graphOptions = { ...options, extraWidths, preambleColumnLimits: columnLimits };
  let layout = await elk.layout(buildElkGraph(description, graphOptions));
  // Widen the innermost narrow flows on each pass, because widening a flow also widens the flows around it; once no
  // flow is narrow, fit each preamble's columns to its flow's width.
  for (;;) {
    const widths = collectWidths(layout);
    const deficits = findDeficits(description, widths, options);
    for (const [id, deficit] of deficits) extraWidths.set(id, (extraWidths.get(id) ?? 0) + deficit);
    if (deficits.size === 0 && !updateColumnLimits(description, widths, options, columnLimits)) break;
    layout = await elk.layout(buildElkGraph(description, graphOptions));
  }
  return toFlowElements(description, layout, { ...options, preambleColumnLimits: columnLimits });
}

// region | Helpers
/** Maps the id of each node in a layout, at any depth, to its width. */
function collectWidths(layout: ElkNode, widths = new Map<string, number>()): Map<string, number> {
  widths.set(layout.id, layout.width ?? 0);
  const children = layout.children ?? [];
  for (const child of children) collectWidths(child, widths);
  return widths;
}

/** Maps each innermost flow that is narrower than its shown preamble to the width that it lacks. */
function findDeficits(
  description: ConfigDescription,
  widths: ReadonlyMap<string, number>,
  { showAmbient }: Pick<ElkGraphOptions, 'showAmbient'>,
): Map<string, number> {
  const deficits = new Map<string, number>();
  if (!showAmbient) return deficits;
  const narrowIds = new Set(
    listPreambleFlowIds(description).filter((id) => (widths.get(id) ?? 0) < PREAMBLE_FLOW_WIDTH),
  );
  for (const state of description.states) {
    if (!narrowIds.has(state.id)) continue;
    const hasNarrowDescendant = description.states.some(
      ({ id }) => narrowIds.has(id) && isDescendant(description, id, state.id),
    );
    if (!hasNarrowDescendant) deficits.set(state.id, PREAMBLE_FLOW_WIDTH - (widths.get(state.id) ?? 0));
  }
  return deficits;
}

/**
 * Sets each shown preamble's column limit to the columns that its flow's width holds, never raising a limit already
 * set, so that the passes end; reports whether any limit changed.
 */
function updateColumnLimits(
  description: ConfigDescription,
  widths: ReadonlyMap<string, number>,
  { showAmbient }: Pick<ElkGraphOptions, 'showAmbient'>,
  columnLimits: Map<string, number>,
): boolean {
  if (!showAmbient) return false;
  let hasChanged = false;
  for (const id of listPreambleFlowIds(description)) {
    const fitting = countPreambleColumns(widths.get(id) ?? 0);
    const current = columnLimits.get(id);
    const next = current === undefined ? fitting : Math.min(current, fitting);
    columnLimits.set(id, next);
    // The graph treats a flow without a limit as having one column.
    if (next !== (current ?? 1)) hasChanged = true;
  }
  return hasChanged;
}

/** Returns whether one state is inside another, at any depth. */
function isDescendant(description: ConfigDescription, id: string, ancestorId: string): boolean {
  let parentId = description.states.find((state) => state.id === id)?.parentId;
  while (parentId !== undefined) {
    if (parentId === ancestorId) return true;
    const currentId = parentId;
    parentId = description.states.find((state) => state.id === currentId)?.parentId;
  }
  return false;
}

/** Lists the flows that hold ambient instructions, and so draw a preamble while preambles are shown. */
function listPreambleFlowIds(description: ConfigDescription): string[] {
  return description.states
    .filter(({ id, isCompound }) => isCompound && description.ambient.some(({ containerId }) => containerId === id))
    .map(({ id }) => id);
}
// endregion | Helpers
