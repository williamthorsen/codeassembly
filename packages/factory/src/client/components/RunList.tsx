import React from 'react';

import { PALETTE } from '../../shared/constants/palette.js';
import type { FlatRunInfo } from '../../shared/types/api.js';
import type { RunStatus } from '../../shared/types/canonical.js';
import { toRunKey } from '../helpers/run-key.js';

import './RunList.css';

interface RunListProps {
  runs: FlatRunInfo[];
  selectedRunKey: string | null;
  onSelectRun: (projectSlug: string, runId: string) => void;
  onDismissRun: (key: string) => void;
  onDismissAll: () => void;
}

interface StatusIndicator {
  symbol: string;
  color: string;
}

const DEFAULT_INDICATOR: StatusIndicator = { symbol: '?', color: PALETTE.white };

const STATUS_INDICATORS: Record<string, StatusIndicator> = {
  in_progress: { symbol: '\u25B6', color: PALETTE.cyan },
  completed: { symbol: '\u2714', color: PALETTE.green },
  failed: { symbol: '\u2718', color: PALETTE.red },
  needs_manual_review: { symbol: '\u26A0', color: PALETTE.yellow },
} satisfies Record<RunStatus, StatusIndicator>;

export function RunList({
  runs,
  selectedRunKey,
  onSelectRun,
  onDismissRun,
  onDismissAll,
}: RunListProps): React.JSX.Element {
  return (
    <div className="run-list">
      <div className="run-list-header">
        <span className="run-list-header-label">Runs</span>
        {runs.length > 0 && (
          <button className="run-list-clear-btn" onClick={onDismissAll}>
            Clear all
          </button>
        )}
      </div>
      {runs.length === 0 ? (
        <div className="run-list-empty">No runs</div>
      ) : (
        <div className="run-list-items">
          {runs.map((run) => {
            const key = toRunKey(run.projectSlug, run.ticketId, run.runId);
            const isSelected = key === selectedRunKey;
            const indicator = STATUS_INDICATORS[run.status] ?? DEFAULT_INDICATOR;

            return (
              <div
                key={key}
                className={`run-list-item${isSelected ? ' run-list-item--selected' : ''}`}
                onClick={() => onSelectRun(run.projectSlug, run.runId)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectRun(run.projectSlug, run.runId);
                  }
                }}
              >
                <span className="run-list-item-status" style={{ color: indicator.color }}>
                  {indicator.symbol}
                </span>
                <div className="run-list-item-content">
                  <div className="run-list-item-run-id">{run.runId}</div>
                  <div className="run-list-item-context">
                    {run.projectSlug} / {run.ticketId}
                  </div>
                </div>
                <button
                  className="run-list-item-dismiss"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDismissRun(key);
                  }}
                  aria-label={`Dismiss ${run.runId}`}
                >
                  {'\u00D7'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
