import type { RoleType } from '@codeassembly/run-core';

import { PALETTE } from './palette.js';

export type { PhaseName, RoleType } from '@codeassembly/run-core';
export { PHASE_NAMES, PHASE_ROLE, PHASE_ROLE_TYPE, ROLE_TYPES } from '@codeassembly/run-core';

export const ROLE_TYPE_COLORS: Record<RoleType, string> = {
  orchestrator: PALETTE.magenta,
  analyst: PALETTE.blue,
  planner: PALETTE.green,
  author: PALETTE.yellow,
  reviewer: PALETTE.red,
};
