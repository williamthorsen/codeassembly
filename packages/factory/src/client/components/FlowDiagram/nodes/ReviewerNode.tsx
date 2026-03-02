import type { Node, NodeProps } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';
import React from 'react';

import { ROLE_TYPE_COLORS, ROLE_TYPE_LIGHT_FILLS } from '../../../../shared/constants/role-types.js';
import type { FlowNodeData } from '../mappers/run-to-flow.js';
import { StatusDot } from './StatusDot.js';

import './nodes.css';

const CRITICALITY_COLORS: Record<string, string> = {
  none: '#2da44e',
  low: '#bf8700',
  medium: '#cf222e',
  high: '#8250df',
};

function getCriticalityColor(criticality: string): string {
  return CRITICALITY_COLORS[criticality] ?? '#888888';
}

export function ReviewerNode({ data }: NodeProps<Node<FlowNodeData>>): React.JSX.Element {
  const borderColor = ROLE_TYPE_COLORS.reviewer;
  const fillColor = ROLE_TYPE_LIGHT_FILLS.reviewer;

  return (
    <div
      className="flow-node"
      style={{
        width: 150,
        height: 64,
        border: `2px solid ${borderColor}`,
        background: fillColor,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <StatusDot status={data.status} />
        <span className="flow-node__label">{data.role}</span>
      </div>
      <span className="flow-node__sublabel">{data.agentId}</span>
      {data.criticality !== undefined && (
        <div>
          {data.reReviewCriticality === undefined ? (
            <span
              className="flow-node__badge"
              data-criticality={data.criticality}
              style={{ background: getCriticalityColor(data.criticality), color: '#ffffff' }}
            >
              {data.criticality}
            </span>
          ) : (
            <span>
              <span
                className="flow-node__badge"
                data-criticality={data.criticality}
                style={{ background: getCriticalityColor(data.criticality), color: '#ffffff' }}
              >
                {data.criticality}
              </span>
              <span style={{ margin: '0 4px', fontSize: 10 }}>&rarr;</span>
              <span
                className="flow-node__badge"
                data-criticality={data.reReviewCriticality}
                style={{
                  background: getCriticalityColor(data.reReviewCriticality),
                  color: '#ffffff',
                }}
              >
                {data.reReviewCriticality}
              </span>
            </span>
          )}
        </div>
      )}
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
