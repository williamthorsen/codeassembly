import React, { useEffect, useMemo, useState } from 'react';

import type { ProjectIndex } from '../shared/types/api.js';
import { fetchProjects } from './api/client.js';
import { GameCanvas } from './components/GameCanvas.js';
import { RunList } from './components/RunList.js';
import { RunSelector } from './components/RunSelector.js';
import { StatusBar } from './components/StatusBar.js';
import { flattenProjectIndex } from './helpers/flatten-project-index.js';
import { toRunKey } from './helpers/run-key.js';
import { useDismissedRuns } from './hooks/useDismissedRuns.js';
import { useRunStatus } from './hooks/useRunStatus.js';

import './App.css';

const PROJECT_POLL_INTERVAL_MS = 5000;

export function App(): React.JSX.Element {
  const [index, setIndex] = useState<ProjectIndex | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  /**
   * Currently selected project slug. Used together with `selectedRun` to look up the full run
   * context. The `selectedRunKey` derivation assumes that `runId` values are unique within a
   * project (across all its tickets). This invariant is guaranteed by the directory-based data
   * source: each run directory name is a unique timestamp-based identifier scoped to its project.
   */
  const [selectedProject, setSelectedProject] = useState<string | null>(null);

  /** Currently selected run ID within `selectedProject`. See `selectedProject` for uniqueness assumption. */
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const { data: runStatus, isLoading, error } = useRunStatus(selectedProject, selectedRun);

  const { dismissed, dismiss, dismissAll } = useDismissedRuns();

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
    if (!selectedProject || !selectedRun) return null;
    const match = allRuns.find((r) => r.projectSlug === selectedProject && r.runId === selectedRun);
    return match ? toRunKey(match.projectSlug, match.ticketId, match.runId) : null;
  }, [selectedProject, selectedRun, allRuns]);

  /**
   * Selects a run by project slug and run ID. The ticket is not tracked because `runId` is
   * assumed to be unique within a project -- the `selectedRunKey` derivation resolves the
   * ticket by finding the matching run in the already-flattened `allRuns` array.
   */
  function handleSelectRun(projectSlug: string, runId: string): void {
    setSelectedProject(projectSlug);
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

  return (
    <div className="app">
      <aside className="sidebar">
        <h1>Artifactory</h1>
        {fetchError && <div className="fetch-error">{fetchError}</div>}
        <RunSelector index={index} onSelectRun={handleSelectRun} />
        <RunList
          runs={visibleRuns}
          selectedRunKey={selectedRunKey}
          onSelectRun={handleSelectRun}
          onDismissRun={(key: string, status: string) => dismiss(key, status)}
          onDismissAll={handleDismissAll}
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
