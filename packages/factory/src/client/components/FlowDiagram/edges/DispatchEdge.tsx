import type { Edge, EdgeProps } from '@xyflow/react';
import { BaseEdge, getSmoothStepPath, MarkerType } from '@xyflow/react';
import React, { useEffect, useRef } from 'react';

import type { DispatchEdgeData } from '../mappers/run-to-flow.js';

type DispatchEdgeType = Edge<DispatchEdgeData, 'dispatch'>;

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

  const [edgePath] = getSmoothStepPath({
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
      {/* Hidden path element for measuring total length (draw animation) */}
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
    </>
  );
}
