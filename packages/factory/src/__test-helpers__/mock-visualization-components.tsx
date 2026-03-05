import React from 'react';

import type { CanonicalRunStatus } from '../shared/types/canonical.js';

interface VisualizationProps {
  status: CanonicalRunStatus;
}

export function MockGameCanvas({ status }: VisualizationProps): React.JSX.Element {
  return <div data-testid="game-canvas" data-run-id={status.runId} />;
}

export function MockFlowDiagram({ status }: VisualizationProps): React.JSX.Element {
  return <div data-testid="flow-diagram" data-run-id={status.runId} />;
}

export function MockCatwalkCanvas({ status }: VisualizationProps): React.JSX.Element {
  return <div data-testid="catwalk-canvas" data-run-id={status.runId} />;
}
