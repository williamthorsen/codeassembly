import { ROLE_TYPES, type RoleType } from 'codeassembly-run-core';

import { PALETTE } from './palette.js';

const ROLE_TYPE_SET: ReadonlySet<string> = new Set(ROLE_TYPES);

function isRoleType(value: string): value is RoleType {
  return ROLE_TYPE_SET.has(value);
}

export const ROLE_TYPE_COLORS: Record<RoleType, string> = {
  orchestrator: PALETTE.magenta,
  analyst: PALETTE.blue,
  planner: PALETTE.green,
  author: PALETTE.yellow,
  reviewer: PALETTE.red,
};

export const ROLE_TYPE_LIGHT_FILLS: Record<RoleType, string> = {
  orchestrator: 'rgba(255,85,255,0.10)',
  analyst: 'rgba(85,85,255,0.10)',
  planner: 'rgba(85,255,85,0.10)',
  author: 'rgba(255,255,85,0.10)',
  reviewer: 'rgba(255,85,85,0.10)',
};

/** Look up the primary color for a role type string, with fallback for unknown values. */
export function getRoleTypeColor(roleType: string, fallback = '#888888'): string {
  return isRoleType(roleType) ? ROLE_TYPE_COLORS[roleType] : fallback;
}

/** Look up the light fill color for a role type string, with fallback for unknown values. */
export function getRoleTypeLightFill(roleType: string, fallback = 'transparent'): string {
  return isRoleType(roleType) ? ROLE_TYPE_LIGHT_FILLS[roleType] : fallback;
}
