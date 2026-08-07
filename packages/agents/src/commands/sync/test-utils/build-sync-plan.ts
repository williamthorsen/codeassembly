import type { SyncPlan } from '../sync.ts';

/** A sync plan holding nothing, so a test states only the fields its assertion turns on. */
export function buildSyncPlan(overrides: Partial<SyncPlan> = {}): SyncPlan {
  return {
    targets: { harnessIds: ['claude'], origin: 'declaration' },
    resolutionReport: [],
    ambientHosts: [],
    unignoredHosts: [],
    retirements: [],
    resolved: [],
    harnessSkillTargets: [],
    skillOrphansByDir: [],
    resolvedSkills: [],
    declaredSkillOrphansByDir: [],
    resolvedSubagents: [],
    harnessSubagentTargets: [],
    subagentOrphansByDir: [],
    sourceSupportPlans: [],
    sourceSupportRetractions: [],
    promptsYmlPaths: [],
    undeclaredPackages: [],
    ...overrides,
  };
}
