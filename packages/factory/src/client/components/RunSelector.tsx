import React from 'react';

import type { ProjectIndex } from '../../shared/types/api.ts';

import './RunSelector.css';

interface RunSelectorProps {
  index: ProjectIndex | null;
  selectedProject: string;
  selectedTicket: string;
  selectedRun: string;
  onSelectProject: (projectSlug: string) => void;
  onSelectTicket: (ticketId: string) => void;
  onSelectRun: (projectSlug: string, runId: string) => void;
}

export function RunSelector({
  index,
  selectedProject,
  selectedTicket,
  selectedRun,
  onSelectProject,
  onSelectTicket,
  onSelectRun,
}: RunSelectorProps): React.JSX.Element {
  const project = index?.projects.find((p) => p.slug === selectedProject);
  const ticket = project?.tickets.find((t) => t.ticketId === selectedTicket);

  return (
    <div className="run-selector">
      <label>
        Project:
        <select value={selectedProject} onChange={(e) => onSelectProject(e.target.value)}>
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
          <select value={selectedTicket} onChange={(e) => onSelectTicket(e.target.value)}>
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
          <select
            value={selectedRun}
            onChange={(e) => {
              if (selectedProject && e.target.value) {
                onSelectRun(selectedProject, e.target.value);
              }
            }}
          >
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
