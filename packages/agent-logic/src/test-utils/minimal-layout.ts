import type { ElkNode } from 'elkjs/lib/elk-api.js';

/** Path of the minimal config's one transition. */
export const MINIMAL_TRANSITION_PATH = 'states.greeting.on["user.replied"]';

/** An ELK result for the minimal config, as ELK returns it with `edgeCoords: ROOT`. */
export const MINIMAL_LAYOUT: ElkNode = {
  id: '__graph__',
  children: [
    {
      id: 'agent',
      x: 12,
      y: 12,
      width: 300,
      height: 400,
      children: [
        { id: 'greeting', x: 20, y: 44, width: 240, height: 90 },
        { id: 'done', x: 20, y: 250, width: 240, height: 40 },
      ],
    },
  ],
  edges: [
    {
      id: MINIMAL_TRANSITION_PATH,
      sources: ['greeting'],
      targets: ['done'],
      sections: [
        { id: 's', startPoint: { x: 150, y: 146 }, bendPoints: [{ x: 150, y: 200 }], endPoint: { x: 150, y: 274 } },
      ],
      labels: [{ text: 'user.replied', x: 160, y: 190, width: 200, height: 26 }],
    },
  ],
};
