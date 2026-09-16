import type { SyncPlan } from '../sync-plan.ts';

/** A sync plan containing nothing, so a test states only the fields on which its assertion turns. */
export function buildSyncPlan(overrides: Partial<SyncPlan> = {}): SyncPlan {
  return {
    targets: { harnessIds: ['claude'], origin: 'declaration' },
    droppedHarnesses: [],
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
    missingSources: [],
    undeclaredPackages: [],
    guidanceHookAdvisories: [],
    ...overrides,
  };
}
