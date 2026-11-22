/** `./job` entry: converts a prompt as a job of `@williamthorsen/toolbelt.llm`, in a page or a function. */
export { MAX_COVERAGE_CHECKS, MAX_SUBMISSIONS } from '../conversion-session/create-conversion-session.ts';
export type { ConvertResult } from '../convert/convert-prompt.ts';
export {
  type ConversionJobOptions,
  createConversionJob,
  createConversionJobFromInput,
  MAX_ROUNDS,
} from './create-conversion-job.ts';
