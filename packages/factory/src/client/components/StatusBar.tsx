import type { CanonicalRunStatus } from 'codeassembly-run-core';
import React from 'react';

import './StatusBar.css';

interface StatusBarProps {
  status: CanonicalRunStatus;
}

export function StatusBar({ status }: StatusBarProps): React.JSX.Element {
  const duration =
    status.completedAt === undefined
      ? null
      : Math.round((new Date(status.completedAt).getTime() - new Date(status.startedAt).getTime()) / 1_000);

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
      {status.reason !== undefined && (
        <span className="status-item">
          <strong>Reason:</strong> {status.reason}
        </span>
      )}
      {duration !== null && (
        <span className="status-item">
          <strong>Duration:</strong> {duration}s
        </span>
      )}
    </div>
  );
}
