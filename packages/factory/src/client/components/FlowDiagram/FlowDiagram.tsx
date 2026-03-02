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
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { CanonicalRunStatus } from '../../../shared/types/canonical.js';
import { DispatchEdge } from './edges/DispatchEdge.js';
import { ReferenceEdge } from './edges/ReferenceEdge.js';
import { ReturnEdge } from './edges/ReturnEdge.js';
import { SpineEdge } from './edges/SpineEdge.js';
import { createFlowConfig, deriveReviewerKey } from './mappers/run-to-flow.js';
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

const STAGGER_DELAY_MS = 150;

function FlowDiagramInner({ status }: FlowDiagramProps): React.JSX.Element {
  // Edge collapse state: tracks which source-target pairs are expanded
  const [expandedEdgePairs, setExpandedEdgePairs] = useState<Set<string>>(() => new Set());
  const prevReviewerKeyRef = useRef('');
  const prevReviewerCountRef = useRef(0);

  // Reset expanded pairs when reviewer set changes
  const reviewerKey = deriveReviewerKey(status);
  if (reviewerKey !== prevReviewerKeyRef.current) {
    prevReviewerKeyRef.current = reviewerKey;
    if (expandedEdgePairs.size > 0) {
      setExpandedEdgePairs(new Set());
    }
  }

  const config = useMemo(() => createFlowConfig(status, expandedEdgePairs), [status, expandedEdgePairs]);

  const edgeTypes = useMemo(
    () => ({
      dispatch: DispatchEdge,
      return: ReturnEdge,
      spine: SpineEdge,
      reference: ReferenceEdge,
    }),
    [],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(config.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(config.edges);

  useEffect(() => {
    const reviewerNodes = config.nodes.filter((n) => n.type === 'reviewer');
    const nonReviewerNodes = config.nodes.filter((n) => n.type !== 'reviewer');
    const currentReviewerCount = reviewerNodes.length;
    const isNewReviewPhase = prevReviewerCountRef.current === 0 && currentReviewerCount > 0;

    if (isNewReviewPhase && currentReviewerCount > 0) {
      // Stagger reviewer nodes one at a time
      setNodes(nonReviewerNodes);

      const timerIds: ReturnType<typeof setTimeout>[] = [];
      for (let i = 0; i < reviewerNodes.length; i++) {
        const timerId = setTimeout(
          () => {
            const reviewerNode = reviewerNodes[i];
            if (reviewerNode === undefined) return;

            const isFinal = i === reviewerNodes.length - 1;
            setNodes((prev) => [...prev, reviewerNode]);

            if (isFinal) {
              // Set edges only when all reviewer nodes are present
              setEdges(config.edges);
            }
          },
          (i + 1) * STAGGER_DELAY_MS,
        );
        timerIds.push(timerId);
      }

      prevReviewerCountRef.current = currentReviewerCount;

      return () => {
        for (const id of timerIds) {
          clearTimeout(id);
        }
      };
    }

    setNodes(config.nodes);
    setEdges(config.edges);
    prevReviewerCountRef.current = currentReviewerCount;

    return;
  }, [config, setNodes, setEdges]);

  const handleEdgeClick = useCallback(
    (_event: React.MouseEvent, edge: { id: string; source: string; target: string }) => {
      if (edge.id.startsWith('collapsed-')) {
        const pairKey = `${edge.source}|${edge.target}`;
        setExpandedEdgePairs((prev) => {
          const next = new Set(prev);
          next.add(pairKey);
          return next;
        });
      }
    },
    [],
  );

  return (
    <div className="flow-diagram">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onEdgeClick={handleEdgeClick}
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
