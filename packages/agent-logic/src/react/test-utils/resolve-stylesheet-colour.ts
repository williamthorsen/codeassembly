/** A colour whose channels are 0–255 and whose alpha is 0–1. */
export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Returns `foreground` composited over the opaque `background`. */
export function composite(foreground: Rgba, background: Rgba): Rgba {
  return {
    r: blendChannel(foreground.r, background.r, foreground.a),
    g: blendChannel(foreground.g, background.g, foreground.a),
    b: blendChannel(foreground.b, background.b, foreground.a),
    a: 1,
  };
}

/** Returns the WCAG 2.2 contrast ratio of `foreground`, composited over the opaque `background`, against it. */
export function measureContrast(foreground: Rgba, background: Rgba): number {
  const foregroundLuminance = readLuminance(composite(foreground, background));
  const backgroundLuminance = readLuminance(background);
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  );
}

/**
 * Returns the custom properties that the stylesheet's rule blocks whose selectors start with one of `selectorStarts`
 * declare, by name, with each value's whitespace collapsed.
 */
export function readDeclarations(stylesheet: string, selectorStarts: string[]): Map<string, string> {
  const declarations = new Map<string, string>();
  for (const selectorStart of selectorStarts) {
    const start = stylesheet.indexOf(selectorStart);
    if (start === -1) throw new Error(`the stylesheet does not contain a block starting with ${selectorStart}`);
    const body = stylesheet.slice(stylesheet.indexOf('{', start) + 1, stylesheet.indexOf('}', start));
    for (const [, name = '', value = ''] of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      declarations.set(name, value.replaceAll(/\s+/g, ' ').replaceAll('( ', '(').replaceAll(' )', ')').trim());
    }
  }
  return declarations;
}

/**
 * Returns the colour of `expression` under `declarations`, resolving a hex colour, `transparent`, `var()` with or
 * without a fallback, and `color-mix(in srgb, …)` with premultiplied alpha, as CSS Color 4 interpolates it. Throws on
 * any other form, so that a derivation outside these forms fails the caller rather than passing unchecked.
 */
export function resolveColour(expression: string, declarations: Map<string, string>): Rgba {
  let current = expression.trim();
  let call = /^var\((.*)\)$/s.exec(current);
  // Follow a chain of `var()` references to the expression that it names.
  while (call) {
    const [name = '', fallback] = splitArguments(call[1] ?? '');
    const value = declarations.get(name.trim()) ?? fallback;
    if (value === undefined) throw new Error(`${name} is not declared and does not have a fallback`);
    current = value.trim();
    call = /^var\((.*)\)$/s.exec(current);
  }
  if (current === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  if (current.startsWith('#')) return parseHex(current);
  const mix = /^color-mix\((.*)\)$/s.exec(current);
  if (mix) return resolveMix(splitArguments(mix[1] ?? ''), declarations);
  throw new Error(`cannot resolve the colour ${current}`);
}

// region | Helpers
/** Returns one channel of `top` at `alpha` over the opaque `bottom`. */
function blendChannel(top: number, bottom: number, alpha: number): number {
  return top * alpha + bottom * (1 - alpha);
}

/** Converts an sRGB channel to linear light, as the WCAG luminance formula does. */
function linearizeChannel(channel: number): number {
  const value = channel / 255;
  return value <= 0.040_45 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

/** Returns the `color-mix()` channel of two weighted colours, premultiplied by their alpha. */
function mixChannel(channel: 'r' | 'g' | 'b', parts: WeightedColour[], alpha: number): number {
  if (alpha === 0) return 0;
  return parts.reduce((sum, { colour, weight }) => sum + colour[channel] * colour.a * weight, 0) / alpha;
}

/** Parses `#rgb`, `#rrggbb`, or `#rrggbbaa`. */
function parseHex(hex: string): Rgba {
  const digits = hex.length === 4 ? hex.slice(1).replaceAll(/./g, '$&$&') : hex.slice(1);
  if (!/^[\da-f]{6}([\da-f]{2})?$/i.test(digits)) throw new Error(`cannot parse the hex colour ${hex}`);
  return {
    r: readHexChannel(digits, 0),
    g: readHexChannel(digits, 2),
    b: readHexChannel(digits, 4),
    a: digits.length === 8 ? readHexChannel(digits, 6) / 255 : 1,
  };
}

/** Returns the two hex digits of `digits` at `index` as a number. */
function readHexChannel(digits: string, index: number): number {
  return Number.parseInt(digits.slice(index, index + 2), 16);
}

/** Returns the WCAG relative luminance of an opaque colour. */
function readLuminance({ r, g, b }: Rgba): number {
  return 0.2126 * linearizeChannel(r) + 0.7152 * linearizeChannel(g) + 0.0722 * linearizeChannel(b);
}

/** Resolves the arguments of `color-mix(in srgb, A [p%], B [q%])`. */
function resolveMix([space, ...components]: string[], declarations: Map<string, string>): Rgba {
  const [first, second] = components.map((component) => splitPercentage(component.trim()));
  if (space?.trim() !== 'in srgb' || components.length !== 2 || first === undefined || second === undefined) {
    throw new Error(`cannot resolve color-mix(${[space, ...components].join(',')})`);
  }
  const firstWeight = first.weight ?? 1 - (second.weight ?? 0.5);
  const parts: WeightedColour[] = [
    { colour: resolveColour(first.colour, declarations), weight: firstWeight },
    { colour: resolveColour(second.colour, declarations), weight: second.weight ?? 1 - firstWeight },
  ];
  const alpha = parts.reduce((sum, { colour, weight }) => sum + colour.a * weight, 0);
  return {
    r: mixChannel('r', parts, alpha),
    g: mixChannel('g', parts, alpha),
    b: mixChannel('b', parts, alpha),
    a: alpha,
  };
}

/** Splits a function's arguments at the commas that are not inside a nested parenthesis. */
function splitArguments(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const character of text) {
    if (character === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      if (character === '(') depth += 1;
      else if (character === ')') depth -= 1;
      current += character;
    }
  }
  parts.push(current);
  return parts;
}

/** Splits a `color-mix()` component into its colour and its weight, when it states one. */
function splitPercentage(component: string): { colour: string; weight: number | undefined } {
  const match = /^(.*)\s(\d+(?:\.\d+)?)%$/s.exec(component);
  if (match?.[1] === undefined || match[2] === undefined) return { colour: component, weight: undefined };
  return { colour: match[1], weight: Number(match[2]) / 100 };
}

interface WeightedColour {
  colour: Rgba;
  weight: number;
}
// endregion | Helpers
