import { changeApproval } from './change-approval.ts';
import { passwordReset } from './password-reset.ts';
import { refundRequest } from './refund-request.ts';

export interface Example {
  name: string;
  /** The value of the page's `example` URL parameter that names this example. */
  slug: string;
  /** The example's config, unvalidated, so that it loads through the same path as a file. */
  value: unknown;
}

/** Configs bundled with the viewer. */
export const examples: Example[] = [
  { name: 'Change approval', slug: 'change-approval', value: changeApproval },
  { name: 'Password reset', slug: 'password-reset', value: passwordReset },
  { name: 'Refund request', slug: 'refund-request', value: refundRequest },
];
