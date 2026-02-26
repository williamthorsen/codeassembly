import React, { useState } from 'react';

import { GameCanvas } from './components/GameCanvas.js';
import { RunSelector } from './components/RunSelector.js';
import { StatusBar } from './components/StatusBar.js';
import { useRunStatus } from './hooks/useRunStatus.js';

import './App.css';

export function App(): React.JSX.Element {
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const { data: runStatus, isLoading, error } = useRunStatus(selectedProject, selectedRun);

  return (
    <div className="app">
      <aside className="sidebar">
        <h1>Artifactory</h1>
        <RunSelector
          onSelectRun={(projectSlug, runId) => {
            setSelectedProject(projectSlug);
            setSelectedRun(runId);
          }}
        />
      </aside>
      <main className="main">
        {runStatus && <StatusBar status={runStatus} />}
        <div className="canvas-container">
          {isLoading && <p>Loading...</p>}
          {error && <p>Error: {error.message}</p>}
          {runStatus && <GameCanvas status={runStatus} />}
        </div>
      </main>
    </div>
  );
}
