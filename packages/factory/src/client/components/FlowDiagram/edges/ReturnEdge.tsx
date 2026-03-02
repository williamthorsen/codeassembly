import type { Edge, EdgeProps } from '@xyflow/react';
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, MarkerType } from '@xyflow/react';
import React, { useEffect, useRef } from 'react';

import type { ReturnEdgeData } from '../mappers/run-to-flow.js';

type ReturnEdgeType = Edge<ReturnEdgeData, 'return'>;

export function ReturnEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd: _markerEnd,
  style: _style,
  ...rest
}: EdgeProps<ReturnEdgeType>): React.JSX.Element {
  const pathRef = useRef<SVGPathElement>(null);

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const isPending = data?.status === 'pending';
  const isNew = data?.isNew === true;
  const strokeColor = data?.color ?? '#777777';
  const criticality = data?.criticality;
  const reReviewCriticality = data?.reReviewCriticality;

  useEffect(() => {
    const pathEl = pathRef.current;
    if (pathEl === null || !isNew) return;
    if (typeof pathEl.getTotalLength !== 'function') return;
    const length = pathEl.getTotalLength();
    if (length === 0) return;
    pathEl.style.setProperty('--path-length', `${String(length)}px`);
  }, [isNew, edgePath]);

  const classNames: string[] = [];
  if (isPending) classNames.push('edge-pending');
  if (isNew) classNames.push('edge-draw');

  return (
    <>
      <path ref={pathRef} d={edgePath} fill="none" stroke="none" />
      <BaseEdge
        path={edgePath}
        style={{
          stroke: strokeColor,
          strokeWidth: 2,
          ...(isPending ? { strokeDasharray: '6 4' } : {}),
        }}
        className={classNames.length > 0 ? classNames.join(' ') : undefined}
        markerEnd={MarkerType.ArrowClosed}
        {...rest}
      />
      {criticality !== undefined && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${String(labelX)}px,${String(labelY)}px)`,
              pointerEvents: 'all',
            }}
            className="nodrag nopan"
          >
            <span className={`criticality-badge criticality-${criticality}`}>{criticality}</span>
            {reReviewCriticality !== undefined && (
              <>
                <span className="criticality-arrow">{'\u2192'}</span>
                <span className={`criticality-badge criticality-${reReviewCriticality}`}>{reReviewCriticality}</span>
              </>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
