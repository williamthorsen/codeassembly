/** `./agent` entry: converts a prompt by directing an ACP agent through the conversion. */
export {
  CONVERSION_SERVER_NAME,
  type ConversionEvent,
  convertWithAgent,
  type ConvertWithAgentOptions,
} from './convert-with-agent.ts';
export { MAX_COVERAGE_CHECKS, MAX_SUBMISSIONS, type SessionEvent } from './create-conversion-session.ts';
