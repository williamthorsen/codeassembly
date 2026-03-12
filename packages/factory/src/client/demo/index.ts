import type { CanonicalRunStatus } from '../../shared/types/canonical.js';
import { moderatelyComplexRun } from './recordings/moderately-complex-run.js';

export interface DemoRecording {
  name: string;
  description: string;
  snapshots: CanonicalRunStatus[];
}

export const DEMO_RECORDINGS: DemoRecording[] = [moderatelyComplexRun];
