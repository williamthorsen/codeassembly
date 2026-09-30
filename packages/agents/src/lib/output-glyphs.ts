import {
  defineGlyphSet,
  type GlyphVariants,
  STATUS_GLYPHS,
  type StatusGlyphName,
} from '@williamthorsen/toolbelt.terminal/candidate';

/** The status glyphs that `codeassembly` prints, each with a rich and a plain rendering. */
export const OUTPUT_GLYPHS = defineGlyphSet({
  failed: readStatusVariants('failed'),
  hint: { plain: 'HINT', rich: '💡' },
  passed: readStatusVariants('passed'),
  removed: { plain: 'DEL', rich: '🧹' },
  warning: readStatusVariants('warning'),
});

export type OutputGlyphName = keyof (typeof OUTPUT_GLYPHS)['plain'];

// region | Helpers

/** Reads both renderings of a shared status glyph, so the set follows the toolbelt's choice of glyph. */
function readStatusVariants(name: StatusGlyphName): GlyphVariants {
  return { plain: STATUS_GLYPHS.plain[name].text, rich: STATUS_GLYPHS.rich[name].text };
}

// endregion | Helpers
