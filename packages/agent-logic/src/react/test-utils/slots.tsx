import type { ReactElement } from 'react';

import type { ButtonProps, LinkButtonProps } from '../slots.ts';

/** Stands in for the app's button, forwarding the ARIA attributes that the package passes. */
export function TestButton({ children, onClick, ...aria }: ButtonProps): ReactElement {
  return (
    <button type="button" onClick={onClick} {...aria}>
      {children}
    </button>
  );
}

/** Stands in for the app's in-page link, marking each one so that a test can tell it from another button. */
export function TestLink({ children, onClick, isInline = false }: LinkButtonProps): ReactElement {
  return (
    <button type="button" data-test-link={isInline ? 'inline' : ''} onClick={onClick}>
      {children}
    </button>
  );
}
