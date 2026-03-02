import React from 'react';

import type { FlowNodeData } from '../mappers/run-to-flow.js';

interface StatusDotProps {
  status: FlowNodeData['status'];
}

export function StatusDot({ status }: StatusDotProps): React.JSX.Element {
  return (
    <span className={`flow-node__status-dot flow-node__status-dot--${status}`}>
      {status === 'completed' && (
        <svg width="8" height="8" viewBox="0 0 8 8" style={{ display: 'block' }}>
          <path d="M1.5 4 L3 5.5 L6.5 2" stroke="#ffffff" strokeWidth="1.5" fill="none" />
        </svg>
      )}
      {status === 'failed' && (
        <svg width="8" height="8" viewBox="0 0 8 8" style={{ display: 'block' }}>
          <path d="M2 2 L6 6 M6 2 L2 6" stroke="#ffffff" strokeWidth="1.5" fill="none" />
        </svg>
      )}
    </span>
  );
}
