import { useCallback, useState } from 'react';

interface SelectionParams {
  project: string;
  ticket: string;
  run: string;
  vis: string;
}

interface UseSelectionParamsResult {
  initialParams: SelectionParams;
  setParams: (partial: Partial<SelectionParams>) => void;
}

export function useSelectionParams(): UseSelectionParamsResult {
  const [initialParams] = useState<SelectionParams>(() => {
    const params = new URLSearchParams(globalThis.location.search);
    return {
      project: params.get('project') ?? '',
      ticket: params.get('ticket') ?? '',
      run: params.get('run') ?? '',
      vis: params.get('vis') ?? '',
    };
  });

  const setParams = useCallback((partial: Partial<SelectionParams>) => {
    const params = new URLSearchParams(globalThis.location.search);
    for (const [key, value] of Object.entries(partial)) {
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    }
    const search = params.toString();
    const url = search ? `${globalThis.location.pathname}?${search}` : globalThis.location.pathname;
    globalThis.history.replaceState(null, '', url);
  }, []);

  return { initialParams, setParams };
}
