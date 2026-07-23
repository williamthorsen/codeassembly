import type { EmitEventResult } from './emit-event.ts';
import { emitEvent } from './emit-event.ts';

export interface RegisterArtifactInput {
  runDir: string;
  filename: string;
  role: string;
  roleType: string;
  agent: string;
  type: string;
  phase: string;
  iteration?: number | undefined;
  note?: string | undefined;
}

/**
 * Register an artifact by emitting an `artifact_written` event to the run log.
 */
export async function registerArtifact(input: RegisterArtifactInput): Promise<EmitEventResult> {
  const { runDir, filename, role, roleType, agent, type, phase, iteration, note } = input;

  return emitEvent({
    runDir,
    event: {
      event: 'artifact_written',
      filename,
      role,
      roleType,
      agent,
      type,
      phase,
      ...(iteration !== undefined && { iteration }),
      ...(note !== undefined && { note }),
    },
  });
}
