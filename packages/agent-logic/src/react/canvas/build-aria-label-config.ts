import type { AriaLabelConfig } from '@xyflow/react';

// The keys that the canvas offers on a focused element; React Flow's defaults name a Delete key that it does not.
const STATE_DESCRIPTION =
  "Press Enter or Space to select. Press Right arrow to move to the state's outgoing transitions, when it has any.";
const baseAriaLabelConfig = {
  'node.a11yDescription.default': STATE_DESCRIPTION,
  // React Flow describes a node with this text while keyboard access is enabled.
  'node.a11yDescription.keyboardDisabled': STATE_DESCRIPTION,
  'edge.a11yDescription.default':
    'Press Enter or Space to select. Press Up or Down arrow to move between transitions from the same state, or Left arrow to return to that state.',
} satisfies Partial<AriaLabelConfig>;

/**
 * Returns the canvas's labels, naming the zoom shortcut on the zoom buttons. The key is the one that React Flow's
 * default `zoomActivationKeyCode` picks, by the same user-agent test.
 */
export function buildAriaLabelConfig(): Partial<AriaLabelConfig> {
  const zoomKey = typeof navigator !== 'undefined' && navigator.userAgent.includes('Mac') ? 'Cmd' : 'Ctrl';
  return {
    ...baseAriaLabelConfig,
    'controls.zoomIn.ariaLabel': `Zoom In (${zoomKey}+scroll)`,
    'controls.zoomOut.ariaLabel': `Zoom Out (${zoomKey}+scroll)`,
  };
}
