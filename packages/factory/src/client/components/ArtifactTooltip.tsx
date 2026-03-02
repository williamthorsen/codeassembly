import React from 'react';

import type { ArtifactTooltipData } from '../game/mappers/run-to-scene.js';

import './ArtifactTooltip.css';

const TOOLTIP_OFFSET = 12;

interface ArtifactTooltipProps {
  type: string;
  tooltip?: ArtifactTooltipData;
  pageX: number;
  pageY: number;
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString();
}

export function ArtifactTooltip({ type, tooltip, pageX, pageY }: ArtifactTooltipProps): React.JSX.Element {
  if (tooltip === undefined) {
    return (
      <div
        role="tooltip"
        className="artifact-tooltip"
        style={{ position: 'fixed', left: pageX + TOOLTIP_OFFSET, top: pageY + TOOLTIP_OFFSET }}
      >
        <div className="artifact-tooltip-row">
          <span className="artifact-tooltip-label">type: </span>
          <span className="artifact-tooltip-value">{type}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      role="tooltip"
      className="artifact-tooltip"
      style={{ position: 'fixed', left: pageX + TOOLTIP_OFFSET, top: pageY + TOOLTIP_OFFSET }}
    >
      <div className="artifact-tooltip-row">
        <span className="artifact-tooltip-label">file: </span>
        <span className="artifact-tooltip-value">{tooltip.filename}</span>
      </div>
      <div className="artifact-tooltip-row">
        <span className="artifact-tooltip-label">role: </span>
        <span className="artifact-tooltip-value">{tooltip.role}</span>
      </div>
      <div className="artifact-tooltip-row">
        <span className="artifact-tooltip-label">agent: </span>
        <span className="artifact-tooltip-value">{tooltip.agent}</span>
      </div>
      <div className="artifact-tooltip-row">
        <span className="artifact-tooltip-label">phase: </span>
        <span className="artifact-tooltip-value">{tooltip.phase}</span>
      </div>
      <div className="artifact-tooltip-row">
        <span className="artifact-tooltip-label">time: </span>
        <span className="artifact-tooltip-value">{formatTimestamp(tooltip.createdAt)}</span>
      </div>
    </div>
  );
}
