import type { Node, NodeProps } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';
import React from 'react';

import { getRoleTypeColor, getRoleTypeLightFill } from '../../../../shared/constants/role-types.js';
import type { QualityGates } from '../../../../shared/types/canonical.js';
import type { FlowNodeData } from '../mappers/run-to-flow.js';
import { StatusDot } from './StatusDot.js';

import './nodes.css';

function isQualityGatesObject(value: unknown): value is QualityGates {
  return typeof value === 'object' && value !== null && 'typecheck' in value;
}

function renderQualityGates(gates: QualityGates): React.JSX.Element {
  const items = [
    { label: 'TC', value: gates.typecheck },
    { label: 'LI', value: gates.lint },
    { label: 'TE', value: gates.tests },
  ];
  return (
    <span className="flow-node__badge" style={{ background: '#e8e8e8', color: '#333333' }}>
      {items.map((item) => {
        const passed = item.value === 'pass' || item.value === 'passed';
        let status: string;
        let color: string;
        if (item.value === undefined) {
          status = 'unknown';
          color = '#999999';
        } else if (passed) {
          status = 'pass';
          color = '#2da44e';
        } else {
          status = 'fail';
          color = '#cf222e';
        }
        return (
          <span key={item.label} data-gate-status={status} style={{ color, marginRight: 4 }}>
            {item.label}
          </span>
        );
      })}
    </span>
  );
}

export function PhaseAgentNode({ data }: NodeProps<Node<FlowNodeData>>): React.JSX.Element {
  const borderColor = getRoleTypeColor(data.roleType);
  const fillColor = getRoleTypeLightFill(data.roleType);

  return (
    <div
      className="flow-node"
      style={{
        width: 160,
        height: 72,
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
      {data.phase === 'architecture' && data.impactLevel !== undefined && (
        <span className="flow-node__badge" style={{ background: '#e8e8e8', color: '#333333' }}>
          {data.impactLevel}
        </span>
      )}
      {data.phase === 'planning' && data.stepCount !== undefined && (
        <span className="flow-node__badge" style={{ background: '#e8e8e8', color: '#333333' }}>
          {data.stepCount} steps
        </span>
      )}
      {data.phase === 'implementation' &&
        isQualityGatesObject(data.qualityGates) &&
        renderQualityGates(data.qualityGates)}
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
