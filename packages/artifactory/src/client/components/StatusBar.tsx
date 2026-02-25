import React from 'react';

import type { CanonicalRunStatus } from '../../shared/types/canonical.js';

import './StatusBar.css';

interface StatusBarProps {
  status: CanonicalRunStatus;
}

export function StatusBar({ status }: StatusBarProps): React.JSX.Element {
  const duration =
    status.completedAt === undefined
      ? null
      : Math.round((new Date(status.completedAt).getTime() - new Date(status.startedAt).getTime()) / 1000);

  return (
    <div className="status-bar">
      <span className="status-item">
        <strong>Run:</strong> {status.runId}
      </span>
      <span className="status-item">
        <strong>Status:</strong> {status.status}
      </span>
      <span className="status-item">
        <strong>Branch:</strong> {status.branch}
      </span>
      {duration !== null && (
        <span className="status-item">
          <strong>Duration:</strong> {duration}s
        </span>
      )}
    </div>
  );
}
