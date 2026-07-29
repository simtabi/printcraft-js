// Memory: what the library remembers, and where it puts it.
//
// Nothing here runs unless it is asked for. `Printcraft.ui.create({ persist:
// true })` is the whole opt-in; everything else is for hosts that want the marks
// in their own database instead of the browser's.

export {
  memoryStore,
  localStore,
  sessionStore,
  httpStore,
  customStore,
  defaultStore,
  SCHEMA_VERSION,
  type Store,
  type WebStoreOptions,
  type HttpStoreOptions,
  type CustomStoreSpec
} from './store';

export {
  Session,
  scopeFor,
  type SessionOptions,
  type StoredMark,
  type RestoredMark,
  type LostMark,
  type RestoreReport,
  type MarkKind,
  type Announcer
} from './session';

export { describe, resolve, type Anchor, type Confidence, type Resolution } from './anchor';

export {
  resolveConfig,
  readSource,
  explain,
  LAYERS,
  type Layer,
  type ConfigSource,
  type ConfigValues,
  type ResolvedConfig,
  type Provenance
} from './config';
