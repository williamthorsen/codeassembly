import {
  describeInvalidOutputStyle,
  type OutputStyle,
  resolveOutputStyle,
} from '@williamthorsen/toolbelt.terminal/candidate';

export const OUTPUT_STYLE_ENV_VAR = 'KB_OUTPUT_STYLE';

const OUTPUT_STYLE_FLAG = '--output-style';

/**
 * Resolves the glyph style of `kb`'s stdout from `--output-style`, then `KB_OUTPUT_STYLE`, then the stream's terminal
 * state, and returns `argv` without the flag, so every command accepts it without parsing it. A value that names no
 * style, or a spaced flag without a value, is reported as a usage error.
 */
export function resolveCliOutputStyle(input: {
  argv: readonly string[];
  env: Readonly<Record<string, string | undefined>>;
  isTty: boolean;
}): { ok: true; argv: string[]; style: OutputStyle } | { ok: false; message: string } {
  const resolution = resolveOutputStyle({
    argv: input.argv,
    env: input.env,
    envVar: OUTPUT_STYLE_ENV_VAR,
    flag: OUTPUT_STYLE_FLAG,
    isTty: input.isTty,
  });
  if (resolution.invalid !== undefined) {
    return { ok: false, message: describeInvalidOutputStyle(resolution.invalid) };
  }

  const argv: string[] = [];
  for (let index = 0; index < input.argv.length; index += 1) {
    const arg = input.argv[index];
    if (arg === undefined) continue;
    if (arg === '--') {
      argv.push(...input.argv.slice(index));
      break;
    }
    if (arg.startsWith(`${OUTPUT_STYLE_FLAG}=`)) continue;
    if (arg === OUTPUT_STYLE_FLAG) {
      const value = input.argv[index + 1];
      // Mirrors the resolver, which reads a dash-led argument other than `-` as no value.
      if (value === undefined || value === '' || (value.startsWith('-') && value !== '-')) {
        return { ok: false, message: `${OUTPUT_STYLE_FLAG} requires a value` };
      }
      index += 1;
      continue;
    }
    argv.push(arg);
  }
  return { ok: true, argv, style: resolution.style };
}
