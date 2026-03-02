import type { Node, NodeProps } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';
import React from 'react';

import { ROLE_TYPE_COLORS, ROLE_TYPE_LIGHT_FILLS } from '../../../../shared/constants/role-types.js';
import type { FlowNodeData } from '../mappers/run-to-flow.js';
import { StatusDot } from './StatusDot.js';

import './nodes.css';

export function CoderShadowNode({ data }: NodeProps<Node<FlowNodeData>>): React.JSX.Element {
  const borderColor = ROLE_TYPE_COLORS.author;
  const fillColor = ROLE_TYPE_LIGHT_FILLS.author;

  return (
    <div
      className="flow-node"
      style={{
        width: 160,
        height: 72,
        border: `2px dashed ${borderColor}`,
        background: fillColor,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        position: 'relative',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 4,
          right: 6,
          fontSize: 14,
          lineHeight: 1,
        }}
      >
        &#x21bb;
      </span>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <StatusDot status={data.status} />
        <span className="flow-node__label">{data.role}</span>
      </div>
      <span className="flow-node__sublabel">{data.agentId}</span>
      {data.fixIteration !== undefined && (
        <span className="flow-node__badge" style={{ background: '#e8e8e8', color: '#333333' }}>
          fix #{data.fixIteration}
        </span>
      )}
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
