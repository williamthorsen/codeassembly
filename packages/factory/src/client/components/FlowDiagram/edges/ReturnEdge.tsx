import type { Edge, EdgeProps } from '@xyflow/react';
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, MarkerType } from '@xyflow/react';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import type { ReturnEdgeData } from '../mappers/run-to-flow.js';
import { PacketAnimation } from './PacketAnimation.js';

type ReturnEdgeType = Edge<ReturnEdgeData, 'return'>;

const DRAW_DURATION_MS = 600;

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
  const wrapperRef = useRef<SVGGElement>(null);
  const [drawPhase, setDrawPhase] = useState<'idle' | 'drawing' | 'packet'>('idle');

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

  // Measure path length, set CSS variable on wrapper <g>, and run draw/packet animation sequence
  useEffect(() => {
    if (!isNew) {
      setDrawPhase('idle');
      wrapperRef.current?.style.removeProperty('--path-length');
      return;
    }

    // Measure the path length and set CSS variable for the draw animation
    const pathEl = pathRef.current;
    const wrapperEl = wrapperRef.current;
    if (pathEl !== null && wrapperEl !== null && typeof pathEl.getTotalLength === 'function') {
      const length = pathEl.getTotalLength();
      if (length > 0) {
        wrapperEl.style.setProperty('--path-length', `${String(length)}px`);
      }
    }

    setDrawPhase('drawing');

    const timerId = setTimeout(() => {
      setDrawPhase('packet');
    }, DRAW_DURATION_MS);

    return () => {
      clearTimeout(timerId);
    };
  }, [isNew, edgePath]);

  const handlePacketComplete = useCallback(() => {
    setDrawPhase('idle');
  }, []);

  const isDrawing = drawPhase === 'drawing';

  // When drawing, only show draw animation (not pending marching-ants).
  // After draw completes, allow pending animation to take over.
  const className =
    [!isDrawing && isPending && 'edge-pending', isDrawing && 'edge-draw'].filter(Boolean).join(' ') || undefined;

  return (
    <g ref={wrapperRef}>
      <path ref={pathRef} d={edgePath} fill="none" stroke="none" />
      <BaseEdge
        path={edgePath}
        style={{
          stroke: strokeColor,
          strokeWidth: 2,
          ...(isPending && !isDrawing ? { strokeDasharray: '6 4' } : {}),
        }}
        className={className}
        markerEnd={MarkerType.ArrowClosed}
        {...rest}
      />
      {drawPhase === 'packet' && (
        <PacketAnimation pathD={edgePath} icon="document" color={strokeColor} onComplete={handlePacketComplete} />
      )}
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
    </g>
  );
}
