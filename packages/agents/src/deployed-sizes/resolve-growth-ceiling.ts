import { DEFAULT_GROWTH_CEILING_BYTES } from './build-size-report.ts';

const BYTES_PER_KIB = 1024;

const GROWTH_CEILING_ENV_VAR = 'CODEASSEMBLY_GROWTH_CEILING_KIB';

const GROWTH_CEILING_OPTION = '--growth-ceiling-kib';

/** Digits without a sign, a fraction, a unit, or a leading zero, so that every accepted string has one reading. */
const POSITIVE_INTEGER = /^[1-9]\d*$/;

/**
 * Resolves the growth ceiling in bytes from the `--growth-ceiling-kib` value, then `CODEASSEMBLY_GROWTH_CEILING_KIB`,
 * then the default, and throws an error naming the source whose value is not a positive integer. An empty variable
 * counts as unset, as a shell clears one.
 */
export function resolveGrowthCeiling(input: {
  option: string | undefined;
  env: Readonly<Record<string, string | undefined>>;
}): number {
  if (input.option !== undefined) {
    return parseKib(input.option, GROWTH_CEILING_OPTION);
  }
  const fromEnv = input.env[GROWTH_CEILING_ENV_VAR];
  if (fromEnv !== undefined && fromEnv !== '') {
    return parseKib(fromEnv, GROWTH_CEILING_ENV_VAR);
  }
  return DEFAULT_GROWTH_CEILING_BYTES;
}

// region | Helpers

/** Converts a whole number of KiB to bytes, throwing an error attributed to `source` when it is not one. */
function parseKib(value: string, source: string): number {
  if (!POSITIVE_INTEGER.test(value)) {
    throw new Error(`${source} must be a positive integer (KiB); got "${value}"`);
  }
  return Number(value) * BYTES_PER_KIB;
}

// endregion | Helpers
