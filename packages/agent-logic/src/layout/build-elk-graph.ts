import type { ElkExtendedEdge, ElkNode } from 'elkjs/lib/elk-api.js';

import { MAX_ACTION_LINES, MAX_CARD_ACTIONS, PREAMBLE_WIDTH } from './card-limits.ts';
import {
  type ActionDescription,
  buildTransitionLabel,
  type ConfigDescription,
  type StateDescription,
} from './describe-config.ts';
import { COMPOUND_PADDING_LEFT, COMPOUND_PADDING_RIGHT, countWrappedLines } from './layout-metrics.ts';
import { estimatePreambleHeight } from './pack-preamble.ts';

/** Id of the graph that contains the root state. */
export const GRAPH_ID = '__graph__';

// -- Text metrics that sizing estimates from; they match the canvas styles --
const CHARACTER_WIDTH = 7.5;
const LABEL_CHARACTER_WIDTH = 6.5;
// A state's title is set in semibold sans, and an event name in semibold mono; both are wider than regular prose.
const TITLE_CHARACTER_WIDTH = 7.6;
const MONO_LABEL_CHARACTER_WIDTH = 7.4;
const LINE_HEIGHT = 18;
const MAX_LABEL_WIDTH = 200;
const LABEL_PADDING = 12;
const STATE_WIDTH = 240;
const STATE_TITLE_LINE_HEIGHT = 20;
const STATE_PADDING_TOP = 8;
const STATE_PADDING = 12;
const COMPOUND_GAP = 16;
// The glyphs beside a state's title.
const GLYPH_COLUMN_WIDTH = 20;
// The indent of an action's list item, which `canvas.css` sets on the list.
const ACTION_INDENT = 18;

/** The width below which a flow cannot hold its preamble. */
export const PREAMBLE_FLOW_WIDTH = COMPOUND_PADDING_LEFT + PREAMBLE_WIDTH + COMPOUND_PADDING_RIGHT;

export interface ElkGraphOptions {
  /** Whether each flow draws its ambient instructions as a preamble, for which the graph reserves room. */
  showAmbient: boolean;
  /** Width to add to the right padding of each listed flow, so that it reaches the width of its preamble. */
  extraWidths?: ReadonlyMap<string, number> | undefined;
  /** The number of columns in which each listed flow may lay out its preamble; a flow that is not listed takes one. */
  preambleColumnLimits?: ReadonlyMap<string, number> | undefined;
}

/** Options that lay out a chart without its preambles. */
export const HIDDEN_AMBIENT: ElkGraphOptions = { showAmbient: false };

/** Builds the ELK graph of a described config: one node per state, nested as the states are, and one edge per transition. */
export function buildElkGraph(description: ConfigDescription, options: ElkGraphOptions = HIDDEN_AMBIENT): ElkNode {
  const { showAmbient, extraWidths, preambleColumnLimits } = options;
  const nodesById = new Map<string, ElkNode>();
  const graph: ElkNode = {
    id: GRAPH_ID,
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.json.edgeCoords': 'ROOT',
      'elk.layered.spacing.nodeNodeBetweenLayers': '56',
      'elk.spacing.edgeLabel': '6',
      'elk.spacing.nodeNode': '40',
    },
    children: [],
    edges: description.transitions.map((transition): ElkExtendedEdge => {
      const { trigger, details } = buildTransitionLabel(transition);
      const triggerLines = trigger === undefined ? [] : [trigger];
      const longestLineWidth = Math.max(
        ...triggerLines.map((line) => line.length * MONO_LABEL_CHARACTER_WIDTH),
        ...details.map((line) => line.length * LABEL_CHARACTER_WIDTH),
      );
      const width = Math.min(MAX_LABEL_WIDTH, Math.ceil(longestLineWidth) + LABEL_PADDING);
      const textWidth = width - LABEL_PADDING;
      const lineCount =
        countWrappedLines(triggerLines, textWidth, MONO_LABEL_CHARACTER_WIDTH) +
        countWrappedLines(details, textWidth, LABEL_CHARACTER_WIDTH);
      return {
        id: transition.path,
        sources: [transition.sourceId],
        targets: [transition.targetId],
        labels: [
          {
            text: [...triggerLines, ...details].join('\n'),
            width,
            height: lineCount * LINE_HEIGHT + 8,
          },
        ],
      };
    }),
  };

  for (const state of description.states) {
    const ambient = showAmbient ? description.ambient.filter(({ containerId }) => containerId === state.id) : [];
    const node: ElkNode = state.isCompound
      ? {
          id: state.id,
          children: [],
          // Reserve room above the children for the container's preamble, "inferred" line, and actions; its name sits
          // outside it. ELK ignores a compound node's minimum size in a hierarchy with edges, so `layoutConfig` widens
          // a narrow flow through `extraWidths`.
          layoutOptions: {
            'elk.padding': `[top=${estimatePreambleHeight(ambient, preambleColumnLimits?.get(state.id) ?? 1) + estimateStateBodyHeight(state) + COMPOUND_GAP},left=${COMPOUND_PADDING_LEFT},bottom=20,right=${COMPOUND_PADDING_RIGHT + (extraWidths?.get(state.id) ?? 0)}]`,
          },
        }
      : { id: state.id, width: STATE_WIDTH, height: estimateStateHeight(state) };
    nodesById.set(state.id, node);
    const parent = state.parentId === undefined ? graph : nodesById.get(state.parentId);
    parent?.children?.push(node);
  }

  return graph;
}

// region | Helpers
/** Counts the lines of a section of actions as a card shows it: the clamped actions, then a line counting the rest. */
function countActionSectionLines(actions: ActionDescription[]): number {
  if (actions.length === 0) return 0;
  const shown = actions.slice(0, MAX_CARD_ACTIONS).map(({ text, gate }) => (gate ? `gate ${text}` : text));
  const width = STATE_WIDTH - 2 * STATE_PADDING - ACTION_INDENT;
  const shownLines = shown.reduce(
    (count, action) => count + Math.min(MAX_ACTION_LINES, countWrappedLines([action], width, CHARACTER_WIDTH)),
    0,
  );
  const moreLine = actions.length > MAX_CARD_ACTIONS ? 1 : 0;
  // One line for the section's heading.
  return 1 + shownLines + moreLine;
}

/** Estimates the height of a state's card without its title: its padding, its "inferred" line, and its actions. */
function estimateStateBodyHeight(state: StateDescription): number {
  const inferredHeight = state.inferred ? LINE_HEIGHT : 0;
  const actionLines = countActionSectionLines(state.entry) + countActionSectionLines(state.exit);
  const actionsHeight = actionLines === 0 ? 0 : actionLines * LINE_HEIGHT + 8;
  return STATE_PADDING_TOP + inferredHeight + actionsHeight + STATE_PADDING;
}

/** Estimates the height of a leaf state's card, its wrapped title included. */
function estimateStateHeight(state: StateDescription): number {
  const glyphWidth = state.waitsForUser || state.isFinal ? GLYPH_COLUMN_WIDTH : 0;
  const titleLines = countWrappedLines(
    [state.name],
    STATE_WIDTH - 2 * STATE_PADDING - glyphWidth,
    TITLE_CHARACTER_WIDTH,
  );
  return titleLines * STATE_TITLE_LINE_HEIGHT + estimateStateBodyHeight(state);
}
// endregion | Helpers
