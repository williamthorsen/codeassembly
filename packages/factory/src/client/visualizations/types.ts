import type React from 'react';

import type { CanonicalRunStatus } from '../../shared/types/canonical.js';

/** Props contract shared by all visualization components. */
export interface VisualizationProps {
  status: CanonicalRunStatus;
}

/** A React component that renders a visualization given a run status. */
export type VisualizationComponent = React.ComponentType<VisualizationProps>;
