import type { Node, NodeProps } from '@xyflow/react';
import React from 'react';

import { getRoleTypeColor } from '../../../../shared/constants/role-types.js';
import type { FlowNodeData } from '../mappers/run-to-flow.js';

import './nodes.css';

function getStatusLabel(status: FlowNodeData['status']): string {
  switch (status) {
    case 'idle':
      return 'Pending';
    case 'working':
      return 'In progress...';
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
    case 'skipped':
      return 'Skipped';
  }
}

export function PhaseGroupNode({ data }: NodeProps<Node<FlowNodeData>>): React.JSX.Element {
  const headerColor = getRoleTypeColor(data.roleType);

  return (
    <div
      className="flow-node"
      style={{
        width: 200,
        minHeight: 120,
        background: '#fafbfc',
        border: '1px solid #d0d7de',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        padding: 12,
      }}
    >
      <span className="flow-node__label" data-role-type={data.roleType} style={{ color: headerColor, fontSize: 14 }}>
        {data.phase}
      </span>
      <span className="flow-node__sublabel">{getStatusLabel(data.status)}</span>
    </div>
  );
}
