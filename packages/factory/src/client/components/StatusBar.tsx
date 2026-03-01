import React from 'react';

import type { CanonicalRunStatus } from '../../shared/types/canonical.js';

import './StatusBar.css';

interface StatusBarProps {
  status: CanonicalRunStatus;
  demoSlot?: React.ReactNode;
}

export function StatusBar({ status, demoSlot }: StatusBarProps): React.JSX.Element {
  const duration =
    status.completedAt === undefined
      ? null
      : Math.round((new Date(status.completedAt).getTime() - new Date(status.startedAt).getTime()) / 1000);

  return (
    <div className="status-bar">
      <span className="status-item">
        <strong>Project:</strong> {status.projectSlug}
      </span>
      {status.ticketId !== undefined && (
        <span className="status-item">
          <strong>Ticket:</strong> {status.ticketId}
        </span>
      )}
      <span className="status-item">
        <strong>Run:</strong> {status.runId}
      </span>
      <span className="status-item">
        <strong>Status:</strong> {status.status}
      </span>
      {duration !== null && (
        <span className="status-item">
          <strong>Duration:</strong> {duration}s
        </span>
      )}
      {demoSlot !== undefined && <span className="status-bar-right">{demoSlot}</span>}
    </div>
  );
}
