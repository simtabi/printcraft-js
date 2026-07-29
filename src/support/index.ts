// one import site for the primitives. no printing knowledge lives in this folder.

export { NS, DATA_ID, FORBIDDEN_TAGS } from './constants';
export { assign, clamp, raise, now, camelize } from './lang';
export {
  toArray,
  isElement,
  escapeHtml,
  eachInclusive,
  selfAndMatches,
  replaceNode,
  removeNode
} from './dom';
export { Emitter } from './emitter';
export { debugState, detectDebug, makeLogger, logger, LEVELS } from './logger';
export type { LogLevel, LogRecord, LogSink } from './logger';

export { PrintcraftError, CODES, fail, isPrintcraftError } from './errors';
export type { ErrorCode, ErrorContext } from './errors';
