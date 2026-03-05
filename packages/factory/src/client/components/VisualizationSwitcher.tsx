import React from 'react';

import type { CanonicalRunStatus } from '../../shared/types/canonical.js';
import { type ActiveView, useVisualizationParam } from '../hooks/useVisualizationParam.js';
import { CatwalkCanvas } from './CatwalkCanvas.js';
import { FlowDiagram } from './FlowDiagram/FlowDiagram.js';
import { GameCanvas } from './GameCanvas.js';

function renderVisualization(view: ActiveView, status: CanonicalRunStatus): React.JSX.Element {
  switch (view) {
    case 'factory':
      return <GameCanvas status={status} />;
    case 'flow':
      return <FlowDiagram status={status} />;
    case 'catwalk':
      return <CatwalkCanvas />;
  }
}

interface VisualizationSwitcherProps {
  status: CanonicalRunStatus;
}

export function VisualizationSwitcher({ status }: VisualizationSwitcherProps): React.JSX.Element {
  const [activeView, setActiveView] = useVisualizationParam();

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
        <button
          type="button"
          className={activeView === 'catwalk' ? 'active' : ''}
          onClick={() => setActiveView('catwalk')}
        >
          Catwalk
        </button>
      </div>
      <div className="canvas-container" data-view={activeView}>
        {renderVisualization(activeView, status)}
      </div>
    </>
  );
}
