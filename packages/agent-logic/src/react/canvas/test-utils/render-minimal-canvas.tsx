import type { RenderResult } from '@testing-library/react';
import type { vi } from 'vitest';

import type { AgentLogicConfig } from '../../../schema/agent-logic-schema.ts';
import { buildMinimalConfig } from '../../../test-utils/minimal-config.ts';
import { MINIMAL_LAYOUT } from '../../../test-utils/minimal-layout.ts';
import { renderCanvas } from './render-canvas.tsx';

/** Renders the canvas for the minimal config, or a variant of it that keeps its states, with a selection and a spy for selection. */
export function renderMinimalCanvas(
  config: AgentLogicConfig = buildMinimalConfig(),
  selectedPath?: string,
): RenderResult & {
  onSelect: ReturnType<typeof vi.fn<(path: string | undefined) => void>>;
} {
  return renderCanvas(config, MINIMAL_LAYOUT, selectedPath);
}
