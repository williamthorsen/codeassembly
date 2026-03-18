import React, { useEffect, useMemo, useRef, useState } from 'react';

import type { ProjectIndex } from '../shared/types/api.js';
import { fetchProjects } from './api/client.js';
import { DemoStatusLight } from './components/DemoStatusLight.js';
import { PlayerPanel } from './components/PlayerPanel.js';
import { RunList } from './components/RunList.js';
import { RunSelector } from './components/RunSelector.js';
import { StatusBar } from './components/StatusBar.js';
import type { DemoRecording } from './demo/index.js';
import { flattenProjectIndex } from './helpers/flatten-project-index.js';
import { toRunKey } from './helpers/run-key.js';
import { useDemoMode } from './hooks/useDemoMode.js';
import { useDismissedRuns } from './hooks/useDismissedRuns.js';
import { useRunPlayback } from './hooks/useRunPlayback.js';
import { useRunStatus } from './hooks/useRunStatus.js';
import { useSelectionParams } from './hooks/useSelectionParams.js';
import { DEFAULT_VIS, visualizationRegistry } from './visualizations/registry.js';

import './App.css';

const PROJECT_POLL_INTERVAL_MS = 5000;

interface Selection {
  project: string | null;
  ticket: string | null;
  run: string | null;
}

/**
 * Validates selection params against the project index, cascading nulls for invalid entries.
 * Returns the corrected selection, or `null` if no correction is needed.
 */
function validateSelection(index: ProjectIndex, selection: Selection): Selection | null {
  const projectEntry = index.projects.find((p) => p.slug === selection.project);
  const validProject = projectEntry ? projectEntry.slug : null;

  const ticketEntry = projectEntry ? projectEntry.tickets.find((t) => t.ticketId === selection.ticket) : undefined;
  const validTicket = ticketEntry ? ticketEntry.ticketId : null;

  const runEntry = ticketEntry ? ticketEntry.runs.find((r) => r.runId === selection.run) : undefined;
  const validRun = runEntry ? runEntry.runId : null;

  if (validProject === selection.project && validTicket === selection.ticket && validRun === selection.run) {
    return null;
  }
  return { project: validProject, ticket: validTicket, run: validRun };
}

export function App(): React.JSX.Element {
  const [index, setIndex] = useState<ProjectIndex | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const { initialParams, setParams } = useSelectionParams();

  /**
   * Selection state — the single source of truth for which project/ticket/run is active.
   * Initialized from URL params so that URLs are shareable. The `selectedRunKey` derivation
   * assumes that `runId` values are unique within a project (across all its tickets). This
   * invariant is guaranteed by the directory-based data source: each run directory name is a
   * unique timestamp-based identifier scoped to its project.
   */
  const [selectedProject, setSelectedProject] = useState<string | null>(() => initialParams.project || null);
  const [selectedTicket, setSelectedTicket] = useState<string | null>(() => initialParams.ticket || null);
  const [selectedRun, setSelectedRun] = useState<string | null>(() => initialParams.run || null);
  const [selectedVis, setSelectedVis] = useState<string>(() => initialParams.vis || DEFAULT_VIS);

  const { data: runStatus, isLoading, error } = useRunStatus(selectedProject, selectedRun);

  const { dismissed, dismiss, dismissAll } = useDismissedRuns();

  const demo = useDemoMode();
  const replay = useRunPlayback(selectedProject, selectedRun);
  const [showDemoSelector, setShowDemoSelector] = useState(false);

  // Determine the active data source: replay > demo > live
  const activeStatus =
    replay.isActive && replay.data !== null ? replay.data : demo.isActive && demo.data !== null ? demo.data : runStatus;

  // Sync selection state -> URL params. A single effect replaces ad-hoc setParams calls.
  useEffect(() => {
    setParams({
      project: selectedProject ?? '',
      ticket: selectedTicket ?? '',
      run: selectedRun ?? '',
      vis: selectedVis === DEFAULT_VIS ? '' : selectedVis,
    });
  }, [selectedProject, selectedTicket, selectedRun, selectedVis, setParams]);

  // Validate initial URL params against loaded data (runs once when index arrives).
  // Captures initial selection at mount time so the dependency array is honest: [index] only.
  const initialSelection = useRef({ project: selectedProject, ticket: selectedTicket, run: selectedRun });
  useEffect(() => {
    if (!index) return;

    const validated = validateSelection(index, initialSelection.current);

    if (validated) {
      setSelectedProject(validated.project);
      setSelectedTicket(validated.ticket);
      setSelectedRun(validated.run);
    }
  }, [index]);

  useEffect(() => {
    fetchProjects()
      .then(setIndex)
      .catch((error_: unknown) => {
        console.error('Failed to fetch projects:', error_);
        setFetchError(error_ instanceof Error ? error_.message : 'Failed to load projects');
      });
  }, []);

  // Poll for project updates
  useEffect(() => {
    const intervalId = setInterval(() => {
      fetchProjects()
        .then(setIndex)
        .catch(() => {
          // Silently ignore poll errors — display stale data rather than flash errors
        });
    }, PROJECT_POLL_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, []);

  const allRuns = useMemo(() => flattenProjectIndex(index), [index]);

  const visibleRuns = useMemo(
    () =>
      allRuns.filter((run) => {
        const key = toRunKey(run.projectSlug, run.ticketId, run.runId);
        const entry = dismissed[key];
        // Show run if: not dismissed, or status has changed since dismissal
        return !entry || entry.status !== run.status;
      }),
    [allRuns, dismissed],
  );

  const selectedRunKey = useMemo(() => {
    if (!selectedProject || !selectedTicket || !selectedRun) return null;
    return toRunKey(selectedProject, selectedTicket, selectedRun);
  }, [selectedProject, selectedTicket, selectedRun]);

  function handleSelectProject(projectSlug: string): void {
    setSelectedProject(projectSlug || null);
    setSelectedTicket(null);
    setSelectedRun(null);
  }

  function handleSelectTicket(ticketId: string): void {
    setSelectedTicket(ticketId || null);
    setSelectedRun(null);
  }

  function handleSelectRun(projectSlug: string, runId: string): void {
    demo.stopDemo();
    replay.stopReplay();
    const match = allRuns.find((r) => r.projectSlug === projectSlug && r.runId === runId);
    setSelectedProject(projectSlug);
    setSelectedTicket(match?.ticketId ?? null);
    setSelectedRun(runId);
  }

  function handleDismissAll(): void {
    dismissAll(
      visibleRuns.map((r) => ({
        key: toRunKey(r.projectSlug, r.ticketId, r.runId),
        status: r.status,
      })),
    );
  }

  function handleStartDemo(recording: DemoRecording): void {
    replay.stopReplay();
    demo.loadRecording(recording);
  }

  function handleStopDemo(): void {
    demo.stopDemo();
    setShowDemoSelector(false);
  }

  function handleStartReplay(): void {
    demo.stopDemo();
    replay.startReplay();
  }

  function handleStopReplay(): void {
    replay.stopReplay();
  }

  // Resolve the active visualization component from the registry
  const VisComponent = visualizationRegistry[selectedVis] ?? visualizationRegistry[DEFAULT_VIS];

  // Determine which player panel to show (if any)
  const isPlayerActive = replay.isActive || demo.isActive;
  const showReplayButton = selectedRun !== null && !replay.isActive && !demo.isActive;

  const demoSlot = (
    <>
      <DemoStatusLight playbackState={demo.playbackState} onClick={() => setShowDemoSelector((prev) => !prev)} />
      {showDemoSelector && (
        <select
          value={demo.activeRecording?.name ?? ''}
          onChange={(e) => {
            const selected = demo.recordings.find((r) => r.name === e.target.value);
            if (selected) {
              handleStartDemo(selected);
            }
          }}
          aria-label="Select recording"
          style={{
            background: '#222222',
            color: '#ffffff',
            border: '1px solid #555555',
            padding: '4px',
            fontFamily: 'monospace',
            fontSize: '12px',
          }}
        >
          <option value="">Select recording...</option>
          {demo.recordings.map((r) => (
            <option key={r.name} value={r.name}>
              {r.name}
            </option>
          ))}
        </select>
      )}
      {showReplayButton && (
        <button
          onClick={handleStartReplay}
          style={{
            background: '#333333',
            color: '#ffffff',
            border: '1px solid #555555',
            padding: '4px 8px',
            cursor: 'pointer',
            fontFamily: 'monospace',
            fontSize: '12px',
          }}
          aria-label="Replay run"
        >
          Replay
        </button>
      )}
    </>
  );

  return (
    <div className="app">
      <aside className="sidebar">
        <h1>Code Assembly Factory</h1>
        {fetchError && <div className="fetch-error">{fetchError}</div>}
        <RunSelector
          index={index}
          selectedProject={selectedProject ?? ''}
          selectedTicket={selectedTicket ?? ''}
          selectedRun={selectedRun ?? ''}
          onSelectProject={handleSelectProject}
          onSelectTicket={handleSelectTicket}
          onSelectRun={handleSelectRun}
        />
        <RunList
          runs={visibleRuns}
          selectedRunKey={selectedRunKey}
          onSelectRun={handleSelectRun}
          onDismissRun={dismiss}
          onDismissAll={handleDismissAll}
        />
      </aside>
      <main className="main">
        <div className="vis-toolbar">
          <label className="vis-selector">
            <span className="vis-label">Viz:</span>
            <select value={selectedVis} onChange={(e) => setSelectedVis(e.target.value)} className="vis-dropdown">
              {Object.keys(visualizationRegistry).map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </select>
          </label>
          {demoSlot}
        </div>
        {isPlayerActive && (
          <PlayerPanel
            label={replay.isActive ? (selectedRun ?? '') : (demo.activeRecording?.name ?? '')}
            playbackState={replay.isActive ? replay.playbackState : demo.playbackState}
            speed={replay.isActive ? replay.speed : demo.speed}
            cursor={replay.isActive ? replay.cursor : demo.cursor}
            snapshotCount={replay.isActive ? replay.snapshotCount : demo.snapshotCount}
            controls={replay.isActive ? replay.controls : demo.controls}
            onStop={replay.isActive ? handleStopReplay : handleStopDemo}
          />
        )}
        {activeStatus && <StatusBar status={activeStatus} />}
        {isLoading && <p>Loading...</p>}
        {error && <p>Error: {error.message}</p>}
        {activeStatus && VisComponent !== undefined && <VisComponent status={activeStatus} />}
      </main>
    </div>
  );
}
