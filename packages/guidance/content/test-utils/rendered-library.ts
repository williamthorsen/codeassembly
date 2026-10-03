import { type HarnessId, renderContentRoot, type RenderedTree } from 'codeassembly/api';

import { CONTENT_ROOT } from './content-root.ts';

const renders = new Map<string, Promise<RenderedTree>>();

/**
 * Renders the library for one harness, once per distinct set of bindings in a test file. `guidanceHooks` maps each
 * hook to the rulebooks bound to it.
 */
export function renderLibrary(
  harness: HarnessId,
  guidanceHooks?: Readonly<Record<string, ReadonlyArray<string>>>,
): Promise<RenderedTree> {
  const key = JSON.stringify([harness, guidanceHooks ?? null]);
  let render = renders.get(key);
  if (render === undefined) {
    render = renderContentRoot(CONTENT_ROOT, guidanceHooks === undefined ? { harness } : { harness, guidanceHooks });
    renders.set(key, render);
  }
  return render;
}
