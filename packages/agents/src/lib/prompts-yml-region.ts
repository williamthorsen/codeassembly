/**
 * Idempotent management of a single codeassembly-owned region within a Rovo Dev `prompts.yml`. The region lives inside
 * the `prompts:` sequence, delimited by `# codeassembly:managed:start` / `# codeassembly:managed:end` comment markers
 * that double as the ownership marker. Everything outside the region — foreign list items and other top-level keys —
 * is preserved verbatim. Every function is a pure string transform with no filesystem access.
 */

const OPEN_MARKER = '  # codeassembly:managed:start';
const CLOSE_MARKER = '  # codeassembly:managed:end';
const REGION_PATTERN = /^[ \t]*# codeassembly:managed:start\n[\s\S]*?^[ \t]*# codeassembly:managed:end[ \t]*$/m;

/** True when the content holds a complete codeassembly region marker pair — the ownership check. */
export function hasPromptsRegion(content: string): boolean {
  return REGION_PATTERN.test(content);
}

/**
 * Inserts or replaces the codeassembly region carrying `regionBody` (the rendered entry list). An existing region is
 * replaced in place; otherwise the region is appended at the end of the `prompts:` sequence — after any foreign items
 * and before any following top-level key — creating a `prompts:` key when the file has none. An empty flow-style
 * `prompts: []` is normalized to a block header first; an inline-valued `prompts:` carrying content is refused (throws)
 * rather than silently duplicating the key into an unloadable file. Re-inserting an identical body yields byte-identical
 * content, which is what keeps `sync` diff-free on re-run.
 */
export function injectPromptsRegion(content: string, regionBody: string): string {
  const region = renderRegion(regionBody);

  if (hasPromptsRegion(content)) {
    // Replace via a function so `$`-sequences in the body are not treated as replacement patterns.
    return content.replace(REGION_PATTERN, () => region);
  }

  const lines = splitContentLines(content);
  const regionLines = region.split('\n');
  const promptsIdx = lines.findIndex(isTopLevelPromptsKey);

  if (promptsIdx === -1) {
    return joinContentLines([...lines, 'prompts:', ...regionLines]);
  }

  const promptsLine = lines[promptsIdx] ?? '';
  if (!isBlockPromptsHeader(promptsLine)) {
    if (!isEmptyFlowPrompts(promptsLine)) {
      throw new Error(
        "Cannot merge the codeassembly region into an inline 'prompts:' value in prompts.yml; convert it to a " +
          "block-style 'prompts:' sequence, then re-run.",
      );
    }
    // An empty flow sequence holds no foreign items, so rewrite it as a block header and insert the region below.
    lines[promptsIdx] = 'prompts:';
  }

  // Walk to the end of the prompts block: indented list items and their children, skipping interleaved blank lines,
  // stopping at the next column-0 key or EOF. The region is placed just after the last item, before that boundary.
  let insertAfter = promptsIdx;
  for (let i = promptsIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined || line.trim() === '') {
      continue;
    }
    if (/^\s/.test(line)) {
      insertAfter = i;
      continue;
    }
    break;
  }

  return joinContentLines([...lines.slice(0, insertAfter + 1), ...regionLines, ...lines.slice(insertAfter + 1)]);
}

/**
 * Strips the codeassembly region. When that leaves the `prompts:` key with no remaining list items, the now-empty
 * `prompts:` line is dropped too. Foreign items and other top-level content survive. Returns the content unchanged
 * when no region is present.
 */
export function removePromptsRegion(content: string): string {
  if (!hasPromptsRegion(content)) {
    return content;
  }

  const lines = splitContentLines(content);
  const startIdx = lines.findIndex(isOpenMarker);
  let endIdx = startIdx;
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line !== undefined && isCloseMarker(line)) {
      endIdx = i;
      break;
    }
  }

  const remaining = [...lines.slice(0, startIdx), ...lines.slice(endIdx + 1)];
  const promptsIdx = remaining.findIndex(isBlockPromptsHeader);
  if (promptsIdx !== -1 && !hasIndentedContentAfter(remaining, promptsIdx)) {
    remaining.splice(promptsIdx, 1);
  }

  return joinContentLines(remaining);
}

// region | Helpers

/** True when any line between `promptsIdx` and the next column-0 key (or EOF) is indented, non-blank content. */
function hasIndentedContentAfter(lines: ReadonlyArray<string>, promptsIdx: number): boolean {
  for (let i = promptsIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined || line.trim() === '') {
      continue;
    }
    return /^\s/.test(line);
  }
  return false;
}

/** True for a block-style `prompts:` header — column 0, no inline value. */
function isBlockPromptsHeader(line: string): boolean {
  return /^prompts:[ \t]*$/.test(line);
}

function isCloseMarker(line: string): boolean {
  return line.trim() === '# codeassembly:managed:end';
}

/** True for an empty flow-style sequence (`prompts: []`), which carries no foreign items. */
function isEmptyFlowPrompts(line: string): boolean {
  return /^prompts:[ \t]*\[[ \t]*\][ \t]*$/.test(line);
}

function isOpenMarker(line: string): boolean {
  return line.trim() === '# codeassembly:managed:start';
}

/** True for any top-level `prompts:` key, whether a block header or an inline-valued line. */
function isTopLevelPromptsKey(line: string): boolean {
  return line.startsWith('prompts:');
}

/** Rejoins content lines, restoring a single trailing newline; returns an empty string for no lines. */
function joinContentLines(lines: ReadonlyArray<string>): string {
  return lines.length === 0 ? '' : `${lines.join('\n')}\n`;
}

/** Wraps the rendered entry body in the region markers, with no surrounding newlines. */
function renderRegion(regionBody: string): string {
  const body = regionBody.replace(/\n+$/, '');
  return body === '' ? `${OPEN_MARKER}\n${CLOSE_MARKER}` : `${OPEN_MARKER}\n${body}\n${CLOSE_MARKER}`;
}

/** Splits content into lines, dropping the artifact empty element a trailing newline would produce. */
function splitContentLines(content: string): Array<string> {
  return content === '' ? [] : content.replace(/\n$/, '').split('\n');
}

// endregion | Helpers
