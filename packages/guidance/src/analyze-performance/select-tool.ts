/** The rule that decides which tool measures a URL, and which PSI failures fall back to the Lighthouse CLI. */
import { isIP } from 'node:net';

/**
 * Reports whether PSI cannot reach a URL: one that the caller marks private, or one on an unspecified, loopback,
 * private, or link-local address or a `localhost`, `.local`, or `.internal` host.
 */
export function isPrivateUrl(url: string, privateUrls: ReadonlySet<string>): boolean {
  if (privateUrls.has(url)) return true;
  const host = new URL(url).hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || /\.(local|localhost|internal)$/.test(host)) return true;
  const family = isIP(host);
  if (family === 4) return isPrivateIpv4(host);
  if (family === 6) return isPrivateIpv6(host);
  return false;
}

/** A failed PSI request: an HTTP error with PSI's message, or a request that did not complete. */
export type PsiFailure = { kind: 'http'; status: number; message: string } | { kind: 'network'; message: string };

/**
 * Returns the reason that a failed PSI request falls back to the Lighthouse CLI, or null when it does not: A 429, a
 * 5xx, a network failure, and a PSI error that reports the page unreachable fall back; any other failure does not.
 */
export function readFallbackReason(failure: PsiFailure): string | null {
  if (failure.kind === 'network') return `PSI request failed: ${failure.message}`;
  if (failure.status === 429) return 'PSI quota exhausted (HTTP 429)';
  if (failure.status >= 500) return `PSI server error (HTTP ${failure.status})`;
  if (UNREACHABLE_PATTERN.test(failure.message)) return `PSI could not load the page: ${failure.message}`;
  return null;
}

/** The tool that measures a URL first: PSI for a public URL, the Lighthouse CLI for one that PSI cannot reach. */
export function selectTool(url: string, privateUrls: ReadonlySet<string>): 'lighthouse' | 'psi' {
  return isPrivateUrl(url, privateUrls) ? 'lighthouse' : 'psi';
}

const UNREACHABLE_PATTERN = /FAILED_DOCUMENT_REQUEST|ERRORED_DOCUMENT_REQUEST|DNS_FAILURE|NO_FCP|unreachable/i;

// region | Helpers

/** Reports whether an IPv4 address is unspecified, loopback, private, or link-local. */
function isPrivateIpv4(host: string): boolean {
  const [a = 0, b = 0] = host.split('.').map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  );
}

/** Reports whether an IPv6 address is loopback, unique-local, or link-local. */
function isPrivateIpv6(host: string): boolean {
  return host === '::1' || /^f[cd]/.test(host) || /^fe[89ab]/.test(host);
}

// endregion | Helpers
