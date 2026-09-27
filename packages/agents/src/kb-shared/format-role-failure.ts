import { DEFAULT_KB_SENTINEL, FEEDBACK_KB_SENTINEL } from './kb-role-sentinels.ts';
import type { ResolveCaptureTargetOutcome } from './resolve-capture-target.ts';

type RoleFailure = Extract<ResolveCaptureTargetOutcome, { reason: 'no-default' | 'no-feedback' }>;

/** A role sentinel's error code and the words that its messages use to name the role. */
interface RoleWording {
  error: 'no-default-store' | 'no-feedback-store';
  label: string;
  sentinel: string;
  key: string;
}

const ROLE_WORDING: Record<RoleFailure['reason'], RoleWording> = {
  'no-default': { error: 'no-default-store', label: 'default', sentinel: DEFAULT_KB_SENTINEL, key: 'default_kb' },
  'no-feedback': { error: 'no-feedback-store', label: 'feedback', sentinel: FEEDBACK_KB_SENTINEL, key: 'feedback_kb' },
};

/**
 * Builds the error code and agent-facing message for a role sentinel (`@default` or `@feedback`) that resolved to no
 * usable store, naming the registry-load cause when one occurred.
 */
export function formatRoleFailure(resolved: RoleFailure): { error: RoleWording['error']; message: string } {
  const role = ROLE_WORDING[resolved.reason];
  return {
    error: role.error,
    message:
      resolved.registryError !== undefined
        ? `could not resolve the ${role.label} event store: ${resolved.registryError}`
        : `--store ${role.sentinel} was given but no ${role.key} is configured in kb.yaml`,
  };
}
