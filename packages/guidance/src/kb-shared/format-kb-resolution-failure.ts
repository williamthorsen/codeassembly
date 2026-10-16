import { formatMissingDestinationMessage } from './format-missing-destination.ts';
import type { KbResolutionFailure } from './resolve-writable-kb.ts';

/** Builds the agent-facing error message for a knowledge base that could not be resolved. */
export function formatKbResolutionFailure(failure: KbResolutionFailure): string {
  switch (failure.reason) {
    case 'no-kb-resolvable':
      return `--kb "${failure.requestedKb}" does not match any registered knowledge base`;
    case 'missing-destination':
      return formatMissingDestinationMessage(failure);
    case 'no-default':
      return failure.registryError !== undefined
        ? `could not resolve the default knowledge base: ${failure.registryError}`
        : '--kb @default was given but kb.yaml does not configure default_kb';
    case 'readonly-kb':
      return `knowledge base "${failure.kbName}" is marked readonly in kb.yaml; writes are refused`;
    default: {
      const _exhaustive: never = failure;
      throw new Error(`unhandled KB resolution failure: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
