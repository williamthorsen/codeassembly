import React from 'react';

import { PALETTE } from '../../shared/constants/palette.js';
import type { FlatRunInfo } from '../../shared/types/api.js';
import type { RunStatus } from '../../shared/types/canonical.js';
import { formatRunId } from '../helpers/format-run-id.js';
import { formatRunTimestamp } from '../helpers/format-run-timestamp.js';
import { toRunKey } from '../helpers/run-key.js';

import './RunList.css';

function buildRunTooltip(run: FlatRunInfo): string {
  const lines = [`Started: ${formatRunTimestamp(run.startedAt)}`];
  if (run.completedAt) lines.push(`Ended: ${formatRunTimestamp(run.completedAt)}`);
  return lines.join('\n');
}

interface RunListProps {
  runs: FlatRunInfo[];
  selectedRunKey: string | null;
  onSelectRun: (projectSlug: string, runId: string) => void;
  onDismissRun: (key: string, status: string) => void;
  onDismissAll: () => void;
}

interface StatusIndicator {
  symbol: string;
  color: string;
}

const DEFAULT_INDICATOR: StatusIndicator = { symbol: '?', color: PALETTE.white };

const STATUS_INDICATORS: Record<string, StatusIndicator> = {
  in_progress: { symbol: '\u{25B6}', color: PALETTE.cyan },
  completed: { symbol: '\u{2714}', color: PALETTE.green },
  failed: { symbol: '\u{2718}', color: PALETTE.red },
  needs_manual_review: { symbol: '\u{26A0}', color: PALETTE.yellow },
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
                  if (!(e.key === 'Enter' || e.key === ' ')) {
                    return;
                  }

                  e.preventDefault();
                  onSelectRun(run.projectSlug, run.runId);
                }}
              >
                <span className="run-list-item-status" style={{ color: indicator.color }}>
                  {indicator.symbol}
                </span>
                <div className="run-list-item-content" title={buildRunTooltip(run)}>
                  <div className="run-list-item-primary">
                    {run.projectSlug} / {run.ticketId}
                  </div>
                  <div className="run-list-item-secondary">{formatRunTimestamp(run.startedAt)}</div>
                </div>
                <button
                  className="run-list-item-dismiss"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDismissRun(key, run.status);
                  }}
                  aria-label={`Dismiss ${formatRunId(run.runId)}`}
                >
                  {'\u{D7}'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
