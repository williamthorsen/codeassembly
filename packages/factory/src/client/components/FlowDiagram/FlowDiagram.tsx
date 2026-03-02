import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
} from '@xyflow/react';
import React, { useEffect, useMemo } from 'react';

import type { CanonicalRunStatus } from '../../../shared/types/canonical.js';
import { createFlowConfig } from './mappers/run-to-flow.js';
import { CoderShadowNode } from './nodes/CoderShadowNode.js';
import { OrchestratorNode } from './nodes/OrchestratorNode.js';
import { PhaseAgentNode } from './nodes/PhaseAgentNode.js';
import { PhaseGroupNode } from './nodes/PhaseGroupNode.js';
import { ReviewerNode } from './nodes/ReviewerNode.js';
import { SkippedPhaseNode } from './nodes/SkippedPhaseNode.js';

import '@xyflow/react/dist/style.css';
import './FlowDiagram.css';

// Static map — hoisted to module scope so the reference is stable across renders.
// PhaseGroupNode is intentional scaffolding for a future ticket (phase grouping visualization).
const NODE_TYPES = {
  orchestrator: OrchestratorNode,
  phaseAgent: PhaseAgentNode,
  reviewer: ReviewerNode,
  coderShadow: CoderShadowNode,
  skippedPhase: SkippedPhaseNode,
  phaseGroup: PhaseGroupNode,
};

interface FlowDiagramProps {
  status: CanonicalRunStatus;
}

function FlowDiagramInner({ status }: FlowDiagramProps): React.JSX.Element {
  const config = useMemo(() => createFlowConfig(status), [status]);

  const [nodes, setNodes, onNodesChange] = useNodesState(config.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(config.edges);

  useEffect(() => {
    setNodes(config.nodes);
    setEdges(config.edges);
  }, [config, setNodes, setEdges]);

  return (
    <div className="flow-diagram">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={NODE_TYPES}
        fitView
      >
        <Background variant={BackgroundVariant.Dots} />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  );
}

export function FlowDiagram({ status }: FlowDiagramProps): React.JSX.Element {
  return (
    <ReactFlowProvider>
      <FlowDiagramInner status={status} />
    </ReactFlowProvider>
  );
}
