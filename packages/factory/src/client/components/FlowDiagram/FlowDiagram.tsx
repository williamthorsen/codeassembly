import { Background, Controls, MiniMap, ReactFlow, ReactFlowProvider, useEdgesState, useNodesState } from '@xyflow/react';
import React, { useEffect, useMemo } from 'react';

import type { CanonicalRunStatus } from '../../../shared/types/canonical.js';
import { createFlowConfig } from './mappers/run-to-flow.js';

import '@xyflow/react/dist/style.css';
import './FlowDiagram.css';

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
        fitView
      >
        <Background variant="dots" />
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
