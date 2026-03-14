import type { PhaseName, RoleType } from '../../../shared/constants/role-types.js';

// ---------------------------------------------------------------------------
// Severity — derived from Criticality in run data
// ---------------------------------------------------------------------------

/**
 * Visual severity level for thought bubble border coloring.
 *
 * Maps from the run data's `Criticality` type:
 * - `'none'` | `'low'` -> `'normal'` (no special border)
 * - `'medium'` -> `'warning'` (amber border)
 * - `'high'` -> `'critical'` (red border)
 */
export type ThoughtBubbleSeverity = 'normal' | 'warning' | 'critical';

// ---------------------------------------------------------------------------
// Thought bubble text categories
// ---------------------------------------------------------------------------

/**
 * Category of content displayed in a thought bubble.
 *
 * - `'task'` — what the agent is currently doing (e.g., "Analyzing architectural impact...")
 * - `'progress'` — quantitative progress summary (e.g., "+142 -38 across 4 files")
 * - `'finding'` — review finding summary (e.g., "Found W: missing null check")
 * - `'waiting'` — blocking dependency (e.g., "Waiting for implementation to complete")
 * - `'idle'` — agent has not started yet (e.g., "Standing by...")
 */
export type ThoughtBubbleCategory = 'task' | 'progress' | 'finding' | 'waiting' | 'idle';

// ---------------------------------------------------------------------------
// Thought bubble text item
// ---------------------------------------------------------------------------

/** A single piece of cycling content within a thought bubble. */
export interface ThoughtBubbleText {
  /** The display text shown in the bubble. */
  content: string;
  /** The category of this text, used to style the text or icon. */
  category: ThoughtBubbleCategory;
}

// ---------------------------------------------------------------------------
// Thought bubble config — one per agent
// ---------------------------------------------------------------------------

/** Configuration for a single agent's thought bubble in the tilemap scene. */
export interface ThoughtBubbleConfig {
  /** Unique identifier for the agent (e.g., "arch", "coder", "reviewer-0"). */
  agentId: string;
  /** Human-readable role name (e.g., "architect", "coder", "correctness-reviewer"). */
  agentRole: string;
  /** The role type, used for color theming. */
  roleType: RoleType;
  /** The phase this agent belongs to. */
  phase: PhaseName;
  /** Cycling text content displayed in the bubble (rotates every 4-6 seconds). */
  texts: ThoughtBubbleText[];
  /** Visual severity for border coloring, derived from highest criticality. */
  severity: ThoughtBubbleSeverity;
  /** Stagger offset in milliseconds — delay before this bubble starts its cycling. */
  staggerOffsetMs: number;
}
