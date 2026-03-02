import type { Node, NodeProps } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';
import React from 'react';

import { ROLE_TYPE_COLORS, ROLE_TYPE_LIGHT_FILLS } from '../../../../shared/constants/role-types.js';
import type { FlowNodeData } from '../mappers/run-to-flow.js';

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

function getGlowClass(runStatus: string | undefined): string {
  if (runStatus === 'in_progress') return 'flow-node__glow--working';
  if (runStatus === 'completed') return 'flow-node__glow--completed';
  if (runStatus === 'failed') return 'flow-node__glow--failed';
  return '';
}

function getSubLabel(runStatus: string | undefined, currentPhaseName: string | undefined): string {
  if (runStatus === 'completed') return 'Complete';
  if (runStatus === 'failed') return 'Failed';
  if (currentPhaseName !== undefined) return `@ ${currentPhaseName}`;
  return '';
}

export function OrchestratorNode({ data }: NodeProps<Node<FlowNodeData>>): React.JSX.Element {
  const borderColor = ROLE_TYPE_COLORS.orchestrator;
  const fillColor = ROLE_TYPE_LIGHT_FILLS.orchestrator;
  const glowClass = getGlowClass(data.runStatus);
  const subLabel = getSubLabel(data.runStatus, data.currentPhaseName);

  return (
    <div
      className={`flow-node ${glowClass}`}
      style={{
        width: 180,
        height: 56,
        border: `2px solid ${borderColor}`,
        background: fillColor,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          border: `1px solid ${borderColor}`,
          borderRadius: 5,
          padding: '4px 8px',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 3,
          boxSizing: 'border-box',
        }}
      >
        <span className="flow-node__label">Orchestrator</span>
        {subLabel !== '' && <span className="flow-node__sublabel">{subLabel}</span>}
        {data.reviewRoundsUsed !== undefined && data.maxReviewRounds !== undefined && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span className="flow-node__sublabel">
              Round {data.reviewRoundsUsed}/{data.maxReviewRounds}
            </span>
            {data.aggregatedCriticality !== undefined && (
              <span
                className="flow-node__badge"
                style={{
                  background: getCriticalityColor(data.aggregatedCriticality),
                  color: '#ffffff',
                  fontSize: 9,
                }}
              >
                {data.aggregatedCriticality}
              </span>
            )}
          </div>
        )}
      </div>
      <Handle type="target" position={Position.Left} id={`spine-in-${data.phase}`} />
      <Handle type="source" position={Position.Right} id={`spine-out-${data.phase}`} />
    </div>
  );
}
