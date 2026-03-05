import { useCallback, useState } from 'react';

export type ActiveView = 'factory' | 'flow' | 'catwalk';

const PARAM_KEY = 'visualization';
const DEFAULT_VALUE: ActiveView = 'catwalk';

/** Replaces the current history entry, ignoring failures in restricted environments such as sandboxed iframes. */
function safeReplaceUrl(params: URLSearchParams): void {
  const search = params.toString();
  const url = search ? `${globalThis.location.pathname}?${search}` : globalThis.location.pathname;
  try {
    globalThis.history.replaceState(null, '', url);
  } catch {
    // Ignore.
  }
}

/** Syncs the active visualization view with the `?visualization` URL search parameter. */
export function useVisualizationParam(): [ActiveView, (view: ActiveView) => void] {
  const [activeView, setActiveViewState] = useState<ActiveView>(() => {
    const params = new URLSearchParams(globalThis.location.search);
    const raw = params.get(PARAM_KEY);

    if (raw === 'factory' || raw === 'flow' || raw === 'catwalk') {
      return raw;
    }

    // Strip invalid param from URL on mount.
    // Calling replaceState inside the lazy initializer is intentional: it ensures
    // the URL is cleaned before the first render, avoiding a flash of an invalid param.
    if (raw !== null) {
      params.delete(PARAM_KEY);
      safeReplaceUrl(params);
    }

    return DEFAULT_VALUE;
  });

  const setActiveView = useCallback((view: ActiveView) => {
    const params = new URLSearchParams(globalThis.location.search);

    if (view === DEFAULT_VALUE) {
      params.delete(PARAM_KEY);
    } else {
      params.set(PARAM_KEY, view);
    }

    safeReplaceUrl(params);
    setActiveViewState(view);
  }, []);

  return [activeView, setActiveView];
}
