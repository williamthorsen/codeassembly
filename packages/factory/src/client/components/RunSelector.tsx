import React, { useEffect, useRef, useState } from 'react';

import type { ProjectIndex } from '../../shared/types/api.js';
import { fetchProjects } from '../api/client.js';
import { useSelectionParams } from '../hooks/useSelectionParams.js';

import './RunSelector.css';

interface RunSelectorProps {
  onSelectRun: (projectSlug: string, runId: string) => void;
}

export function RunSelector({ onSelectRun }: RunSelectorProps): React.JSX.Element {
  const { initialParams, setParams } = useSelectionParams();

  const [index, setIndex] = useState<ProjectIndex | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<string>(initialParams.project);
  const [selectedTicket, setSelectedTicket] = useState<string>(initialParams.ticket);
  const [selectedRun, setSelectedRun] = useState<string>(initialParams.run);

  const hasValidated = useRef(false);

  useEffect(() => {
    fetchProjects()
      .then(setIndex)
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Failed to load projects';
        setFetchError(message);
        console.error('Failed to fetch projects:', error);
      });
  }, []);

  // Validate URL params against loaded data
  useEffect(() => {
    if (!index || hasValidated.current) return;
    hasValidated.current = true;

    let validProject = '';
    let validTicket = '';
    let validRun = '';

    const projectEntry = index.projects.find((p) => p.slug === selectedProject);
    if (projectEntry) {
      validProject = projectEntry.slug;

      const ticketEntry = projectEntry.tickets.find((t) => t.ticketId === selectedTicket);
      if (ticketEntry) {
        validTicket = ticketEntry.ticketId;

        const runEntry = ticketEntry.runs.find((r) => r.runId === selectedRun);
        if (runEntry) {
          validRun = runEntry.runId;
        }
      }
    }

    // Update state and URL if any param was invalid
    if (validProject !== selectedProject || validTicket !== selectedTicket || validRun !== selectedRun) {
      setSelectedProject(validProject);
      setSelectedTicket(validTicket);
      setSelectedRun(validRun);
      setParams({ project: validProject, ticket: validTicket, run: validRun });
    }

    // If full valid selection exists, sync with App
    if (validProject && validRun) {
      onSelectRun(validProject, validRun);
    }
  }, [index, selectedProject, selectedTicket, selectedRun, setParams, onSelectRun]);

  const project = index?.projects.find((p) => p.slug === selectedProject);
  const ticket = project?.tickets.find((t) => t.ticketId === selectedTicket);

  function handleRunSelect(runId: string) {
    setSelectedRun(runId);
    setParams({ run: runId });
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
            setParams({ project: e.target.value, ticket: '', run: '' });
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
              setParams({ ticket: e.target.value, run: '' });
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
