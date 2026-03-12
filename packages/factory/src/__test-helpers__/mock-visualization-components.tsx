import React from 'react';

import type { CanonicalRunStatus } from '../shared/types/canonical.js';

interface VisualizationProps {
  status: CanonicalRunStatus;
}

export function MockCatwalkCanvas({ status }: VisualizationProps): React.JSX.Element {
  return <div data-testid="catwalk-canvas" data-run-id={status.runId} />;
}
