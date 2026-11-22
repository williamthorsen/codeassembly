import type { ReactNode } from 'react';

/**
 * The props of the app's button. The component renders a `<button type="button">` that looks like a button at rest
 * and shows the pointer, hover, and focus states; it forwards each ARIA attribute that it receives to the button.
 */
export interface ButtonProps {
  children: ReactNode;
  onClick: () => void;
  'aria-controls'?: string | undefined;
  'aria-describedby'?: string | undefined;
  'aria-expanded'?: boolean | undefined;
  'aria-label'?: string | undefined;
}

/**
 * The props of the app's in-page link. The component renders a `<button type="button">` that looks like a link and
 * shows the pointer, hover, and focus states; `children` is the name of the element that it selects.
 */
export interface LinkButtonProps {
  children: ReactNode;
  onClick: () => void;
  /** Whether the link stands inside a sentence, for which the link keeps its underline at rest. */
  isInline?: boolean | undefined;
}
