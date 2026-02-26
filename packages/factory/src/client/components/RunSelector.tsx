import React, { useEffect, useState } from 'react';

import type { ProjectIndex } from '../../shared/types/api.js';
import { fetchProjects } from '../api/client.js';

import './RunSelector.css';

interface RunSelectorProps {
  onSelectRun: (projectSlug: string, runId: string) => void;
}

export function RunSelector({ onSelectRun }: RunSelectorProps): React.JSX.Element {
  const [index, setIndex] = useState<ProjectIndex | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [selectedTicket, setSelectedTicket] = useState<string>('');
  const [selectedRun, setSelectedRun] = useState<string>('');

  useEffect(() => {
    fetchProjects()
      .then(setIndex)
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Failed to load projects';
        setFetchError(message);
        console.error('Failed to fetch projects:', error);
      });
  }, []);

  const project = index?.projects.find((p) => p.slug === selectedProject);
  const ticket = project?.tickets.find((t) => t.ticketId === selectedTicket);

  function handleRunSelect(runId: string) {
    setSelectedRun(runId);
    if (selectedProject && runId) {
      onSelectRun(selectedProject, runId);
    }
  }

  return (
    <div className="run-selector">
      {fetchError && <div className="run-selector-error">{fetchError}</div>}
      <label>
        Project:
        <select
          value={selectedProject}
          onChange={(e) => {
            setSelectedProject(e.target.value);
            setSelectedTicket('');
            setSelectedRun('');
          }}
        >
          <option value="">Select project...</option>
          {index?.projects.map((p) => (
            <option key={p.slug} value={p.slug}>
              {p.slug}
            </option>
          ))}
        </select>
      </label>

      {project && (
        <label>
          Ticket:
          <select
            value={selectedTicket}
            onChange={(e) => {
              setSelectedTicket(e.target.value);
              setSelectedRun('');
            }}
          >
            <option value="">Select ticket...</option>
            {project.tickets.map((t) => (
              <option key={t.ticketId} value={t.ticketId}>
                {t.ticketId} ({t.runs.length} runs)
              </option>
            ))}
          </select>
        </label>
      )}

      {ticket && (
        <label>
          Run:
          <select value={selectedRun} onChange={(e) => handleRunSelect(e.target.value)}>
            <option value="">Select run...</option>
            {ticket.runs.map((r) => (
              <option key={r.runId} value={r.runId}>
                {r.runId} ({r.status})
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
