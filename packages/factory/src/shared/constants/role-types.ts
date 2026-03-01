import { PALETTE } from './palette.js';

export const ROLE_TYPES = ['orchestrator', 'analyst', 'planner', 'author', 'reviewer'] as const;
export type RoleType = (typeof ROLE_TYPES)[number];

export const PHASE_NAMES = [
  'architecture',
  'planning',
  'implementation',
  'review',
  'simplifier',
  'holistic',
  'summary',
] as const;
export type PhaseName = (typeof PHASE_NAMES)[number];

export const PHASE_ROLE: Record<PhaseName, string> = {
  architecture: 'architect',
  planning: 'planner',
  implementation: 'coder',
  review: 'reviewer',
  simplifier: 'simplifier',
  holistic: 'holistic-reviewer',
  summary: 'orchestrator',
};

export const PHASE_ROLE_TYPE: Record<PhaseName, RoleType> = {
  architecture: 'analyst',
  planning: 'planner',
  implementation: 'author',
  review: 'reviewer',
  simplifier: 'reviewer',
  holistic: 'reviewer',
  summary: 'orchestrator',
};

export const ROLE_TYPE_COLORS: Record<RoleType, string> = {
  orchestrator: PALETTE.magenta,
  analyst: PALETTE.blue,
  planner: PALETTE.green,
  author: PALETTE.yellow,
  reviewer: PALETTE.red,
};
