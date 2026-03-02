import type { Edge, EdgeProps } from '@xyflow/react';
import { EdgeLabelRenderer, getSmoothStepPath } from '@xyflow/react';
import React from 'react';

import type { ReferenceEdgeData } from '../mappers/run-to-flow.js';

type ReferenceEdgeType = Edge<ReferenceEdgeData, 'reference'>;

const STROKE_COLOR = '#c4c8d0';

export function ReferenceEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
}: EdgeProps<ReferenceEdgeType>): React.JSX.Element {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  return (
    <>
      <path
        d={edgePath}
        fill="none"
        stroke={STROKE_COLOR}
        strokeWidth={1}
        strokeDasharray="4 3"
        style={{ pointerEvents: 'none' }}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${String(labelX)}px,${String(labelY)}px)`,
            pointerEvents: 'all',
            fontStyle: 'italic',
            fontSize: 9,
            color: '#656d76',
            background: 'rgba(250,251,252,0.85)',
            padding: '1px 4px',
            borderRadius: 3,
          }}
          className="nodrag nopan"
        >
          same agent
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
