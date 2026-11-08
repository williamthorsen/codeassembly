import type { ElkExtendedEdge, ElkNode, ElkPoint } from 'elkjs/lib/elk-api.js';

/**
 * An ELK result for the branching config, as ELK returns it with `edgeCoords: ROOT`: states in canvas order from top
 * to bottom, with the transition from `asking` to `done` routed down the chart's right-hand side.
 */
export const BRANCHING_LAYOUT: ElkNode = {
  id: '__graph__',
  children: [
    {
      id: 'agent',
      x: 12,
      y: 12,
      width: 600,
      height: 900,
      children: [
        { id: 'asking', x: 20, y: 44, width: 240, height: 90 },
        {
          id: 'checking',
          x: 20,
          y: 300,
          width: 400,
          height: 300,
          children: [{ id: 'looking_up', x: 20, y: 60, width: 240, height: 90 }],
        },
        { id: 'done', x: 20, y: 760, width: 240, height: 40 },
      ],
    },
  ],
  edges: [
    buildEdge('states.asking.on["user.agreed"]', 'asking', 'done', [
      { x: 272, y: 100 },
      { x: 560, y: 100 },
      { x: 560, y: 790 },
      { x: 272, y: 790 },
    ]),
    buildEdge('states.asking.on["user.declined"]', 'asking', 'checking', [
      { x: 150, y: 146 },
      { x: 150, y: 312 },
    ]),
    buildEdge('states.checking.on["user.cancelled"]', 'checking', 'done', [
      { x: 150, y: 612 },
      { x: 150, y: 772 },
    ]),
    buildEdge('states.checking.states.looking_up.on["lookup.finished"]', 'looking_up', 'done', [
      { x: 292, y: 417 },
      { x: 460, y: 417 },
      { x: 460, y: 780 },
      { x: 272, y: 780 },
    ]),
  ],
};

// region | Helpers
/** Builds a laid-out edge along a route, with a label beside the route's second point. */
function buildEdge(
  id: string,
  source: string,
  target: string,
  [startPoint, ...rest]: [ElkPoint, ...ElkPoint[]],
): ElkExtendedEdge {
  const endPoint = rest.at(-1) ?? startPoint;
  const labelAnchor = rest[0] ?? startPoint;
  return {
    id,
    sources: [source],
    targets: [target],
    sections: [{ id: `${id}:section`, startPoint, bendPoints: rest.slice(0, -1), endPoint }],
    labels: [{ text: id, x: labelAnchor.x + 10, y: labelAnchor.y + 20, width: 120, height: 26 }],
  };
}
// endregion | Helpers
