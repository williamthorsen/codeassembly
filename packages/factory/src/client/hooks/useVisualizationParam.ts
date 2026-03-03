import { useCallback, useState } from 'react';

export type ActiveView = 'factory' | 'flow';

const PARAM_KEY = 'visualization';
const VALID_VALUES = new Set<string>(['factory', 'flow']);
const DEFAULT_VALUE: ActiveView = 'factory';

function isValidActiveView(value: string | null): value is ActiveView {
  return value !== null && VALID_VALUES.has(value);
}

export function useVisualizationParam(): [ActiveView, (view: ActiveView) => void] {
  const [activeView, setActiveViewState] = useState<ActiveView>(() => {
    const params = new URLSearchParams(globalThis.location.search);
    const raw = params.get(PARAM_KEY);

    if (isValidActiveView(raw)) {
      return raw;
    }

    // Strip invalid param from URL on mount.
    // Calling replaceState inside the lazy initializer is intentional: it ensures
    // the URL is cleaned before the first render, avoiding a flash of an invalid param.
    if (raw !== null) {
      params.delete(PARAM_KEY);
      const search = params.toString();
      const url = search ? `${globalThis.location.pathname}?${search}` : globalThis.location.pathname;
      try {
        globalThis.history.replaceState(null, '', url);
      } catch {
        // Ignore — URL cleanup is best-effort; restricted environments (sandboxed iframes)
        // may disallow history manipulation.
      }
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

    const search = params.toString();
    const url = search ? `${globalThis.location.pathname}?${search}` : globalThis.location.pathname;

    try {
      globalThis.history.replaceState(null, '', url);
    } catch {
      // Ignore — URL persistence is best-effort in restricted environments.
    }

    setActiveViewState(view);
  }, []);

  return [activeView, setActiveView];
}
