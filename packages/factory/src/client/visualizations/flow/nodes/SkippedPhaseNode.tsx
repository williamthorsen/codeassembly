import type { Node, NodeProps } from '@xyflow/react';
import React from 'react';

import type { FlowNodeData } from '../mappers/run-to-flow.js';

import './nodes.css';

export function SkippedPhaseNode({ data }: NodeProps<Node<FlowNodeData>>): React.JSX.Element {
  return (
    <div
      className="flow-node"
      style={{
        width: 120,
        height: 56,
        border: '1px dashed #c4c8d0',
        background: 'transparent',
        opacity: 0.4,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
      }}
    >
      <span className="flow-node__label">{data.role}</span>
      <span className="flow-node__badge" style={{ background: '#e8e8e8', color: '#656d76' }}>
        Skipped
      </span>
    </div>
  );
}
