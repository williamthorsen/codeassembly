import React, { type PropsWithChildren } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { renderHookWithError } from '../render-errors.ts';

describe('renderHookWithError', () => {
  it('has an error in the render result if an error is thrown in the hook', () => {
    function useWithError() {
      throw new Error('An error occurred.');
    }

    expect(() => renderHookWithError(useWithError)).toThrow(new Error('An error occurred.'));
  });

  it('does not have an error in the render result if no error is thrown in the hook', () => {
    const useWithoutError = vi.fn();

    expect(() => renderHookWithError(useWithoutError)).not.toThrow();

    expect(useWithoutError).toHaveBeenCalled();
  });

  it('renders hook with wrapper when wrapper option is provided', () => {
    const TestContext = React.createContext<string>('default-value');

    function useContextHook() {
      return React.useContext(TestContext);
    }

    const contextValue = 'test-context-value';
    const TestWrapper: React.FC<PropsWithChildren> = ({ children }) => (
      <TestContext.Provider value={contextValue}>{children}</TestContext.Provider>
    );

    const { result } = renderHookWithError(useContextHook, { wrapper: TestWrapper });

    expect(result.current).toBe(contextValue);
  });
});
