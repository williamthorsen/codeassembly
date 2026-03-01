import type { RunEvent, RunHeader } from '../../shared/types/run-log.js';
import { moderatelyComplexRun } from './recordings/moderately-complex-run.js';

export interface DemoRecording {
  name: string;
  description: string;
  header: RunHeader;
  events: RunEvent[];
}

export const DEMO_RECORDINGS: DemoRecording[] = [moderatelyComplexRun];
