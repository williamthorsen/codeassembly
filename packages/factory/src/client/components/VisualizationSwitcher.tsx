import React, { useState } from 'react';

import type { CanonicalRunStatus } from '../../shared/types/canonical.js';
import { FlowDiagram } from './FlowDiagram/FlowDiagram.js';
import { GameCanvas } from './GameCanvas.js';

type ActiveView = 'factory' | 'flow';

interface VisualizationSwitcherProps {
  status: CanonicalRunStatus;
}

export function VisualizationSwitcher({ status }: VisualizationSwitcherProps): React.JSX.Element {
  const [activeView, setActiveView] = useState<ActiveView>('factory');

  return (
    <>
      <div className="viz-toggle">
        <button
          type="button"
          className={activeView === 'factory' ? 'active' : ''}
          onClick={() => setActiveView('factory')}
        >
          Factory
        </button>
        <button type="button" className={activeView === 'flow' ? 'active' : ''} onClick={() => setActiveView('flow')}>
          Flow
        </button>
      </div>
      <div className="canvas-container" data-view={activeView}>
        {activeView === 'factory' ? <GameCanvas status={status} /> : <FlowDiagram status={status} />}
      </div>
    </>
  );
}
