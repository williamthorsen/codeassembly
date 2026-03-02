import type { Edge, EdgeProps } from '@xyflow/react';
import { getSmoothStepPath } from '@xyflow/react';
import React from 'react';

import type { SpineEdgeData } from '../mappers/run-to-flow.js';

type SpineEdgeType = Edge<SpineEdgeData, 'spine'>;

const SPINE_STROKE = 'rgba(255, 85, 255, 0.3)';
const CHEVRON_ID = 'spine-chevron-marker';

export function SpineEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
}: EdgeProps<SpineEdgeType>): React.JSX.Element {
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const markerId = `${CHEVRON_ID}-${id}`;
  const markerUrl = `url(#${markerId})`;

  return (
    <>
      <defs>
        <marker
          id={markerId}
          markerWidth="8"
          markerHeight="8"
          refX="4"
          refY="4"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <polygon points="0,0 8,4 0,8" fill={SPINE_STROKE} />
        </marker>
      </defs>
      <path
        d={edgePath}
        fill="none"
        stroke={SPINE_STROKE}
        strokeWidth={1}
        markerMid={markerUrl}
        markerEnd={markerUrl}
        style={{ pointerEvents: 'none' }}
      />
    </>
  );
}
