export {
  configFileShape,
  defaultKbConfig,
  isAtLeastAsShareable,
  type KbConfig,
  type StoreVisibility,
} from './config-schema.ts';
export { isKbLoaderError, KbLoaderError } from './kb-loader-error.ts';
export { loadKbConfig } from './load-config.ts';
export { createNoteScopeMatcher, type NoteScopeMatcher } from './note-scope.ts';
