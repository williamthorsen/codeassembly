import type { Edge, EdgeProps } from '@xyflow/react';
import { BaseEdge, getSmoothStepPath, MarkerType } from '@xyflow/react';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import type { DispatchEdgeData } from '../mappers/run-to-flow.js';
import { PacketAnimation } from './PacketAnimation.js';

type DispatchEdgeType = Edge<DispatchEdgeData, 'dispatch'>;

const DRAW_DURATION_MS = 600;

export function DispatchEdge({
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
}: EdgeProps<DispatchEdgeType>): React.JSX.Element {
  const pathRef = useRef<SVGPathElement>(null);
  const wrapperRef = useRef<SVGGElement>(null);
  const [drawPhase, setDrawPhase] = useState<'idle' | 'drawing' | 'packet'>('idle');

  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    offset: data?.offset ?? 0,
  });

  const isPending = data?.status === 'pending';
  const isNew = data?.isNew === true;
  const strokeColor = data?.color ?? '#777777';

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
      {/* Hidden path for measuring total length (draw animation) */}
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
        <PacketAnimation pathD={edgePath} icon="gear" color={strokeColor} onComplete={handlePacketComplete} />
      )}
    </g>
  );
}
