// Errors that say what to do.
//
// A stack trace tells you where something threw. It rarely tells you what to
// change, and for a library sitting between someone's markup and their printer,
// "what to change" is the only useful part. So every failure carries a stable
// code you can branch on, a hint written for the person who hit it, and whatever
// context made it specific.
//
// Codes are part of the public surface. They can be added but not renamed.

/** Every failure printcraft raises on its own. */
export const CODES = {
  PC_TARGET_NOT_FOUND: 'Nothing matched the target selector',
  PC_TARGET_INVALID: 'The target is not a selector or an element',
  PC_TARGET_UNPRINTABLE: 'That tag cannot be a print target',
  PC_OPTIONS_INVALID: 'An option was the wrong shape or an impossible value',
  PC_SELECTOR_INVALID: 'A css selector could not be parsed',
  PC_SELECTOR_UNSAFE: 'A selector contained characters that would break out of a css rule',
  PC_CLIP_INVALID: 'The clip rectangle is missing numbers or too small to print',
  PC_CONFIG_INVALID: 'A config file or block was not usable',
  PC_CONFIG_UNREACHABLE: 'The config could not be fetched',
  PC_POPUP_BLOCKED: 'The browser blocked the print window',
  PC_MOUNT_TIMEOUT: 'The print document never became ready',
  PC_RASTERIZE_FAILED: 'The page could not be turned into pixels',
  PC_CLIPBOARD_DENIED: 'The clipboard refused the write',
  PC_REDACTION_LEAK: 'Redacted content was still in the print document',
  PC_EMAIL_INVALID: 'The message could not be sent as addressed',
  PC_BACKEND_UNSUPPORTED: 'The backend cannot do what was asked of it'
} as const;

export type ErrorCode = keyof typeof CODES;

/** One line saying what to do about it. */
const HINTS: Record<ErrorCode, string> = {
  PC_TARGET_NOT_FOUND:
    'Check the selector, and that the element exists by the time the job starts.',
  PC_TARGET_INVALID: 'Pass a css selector string, an Element, or an array of either.',
  PC_TARGET_UNPRINTABLE: 'Point at the element holding the content instead.',
  PC_OPTIONS_INVALID: 'The message names the option; see docs/tools/options.md.',
  PC_SELECTOR_INVALID: 'Usually a typo. Try it in document.querySelectorAll first.',
  PC_SELECTOR_UNSAFE: 'Remove {, }, < or /*; a valid css selector never contains them.',
  PC_CLIP_INVALID: 'x, y, width and height all have to be numbers, and big enough to see.',
  PC_CONFIG_INVALID: 'The config has to be a plain object, or json that parses to one.',
  PC_CONFIG_UNREACHABLE:
    'A file:// page cannot fetch its siblings. Serve the page, or inline the config in a ' +
    '<script type="application/json" data-printcraft-config> block.',
  PC_POPUP_BLOCKED: 'Use printInIframe: true, or allow popups for this site.',
  PC_MOUNT_TIMEOUT: 'Raise mountTimeout, or check whether an extension is blocking the frame.',
  PC_RASTERIZE_FAILED: 'Try the renderer option to swap in another rasteriser.',
  PC_CLIPBOARD_DENIED:
    'Browsers only allow a clipboard write during a user gesture, and Safari needs the ' +
    'ClipboardItem built before anything is awaited.',
  PC_REDACTION_LEAK:
    'Something after redaction put the content back. Check any transform, hook or backend ' +
    'that re-reads the page. redactionPolicy: "warn" prints anyway.',
  PC_EMAIL_INVALID: 'Check the addresses, and the allowedRecipients list if you set one.',
  PC_BACKEND_UNSUPPORTED: 'Ask the backend what it can do with capabilities() first.'
};

export interface ErrorContext {
  [key: string]: unknown;
}

/**
 * Everything printcraft throws.
 *
 * `instanceof Error` still holds, so existing `catch` blocks and error reporters
 * carry on working; the code and hint are extra rather than a replacement.
 */
export class PrintcraftError extends Error {
  readonly code: ErrorCode;
  readonly hint: string;
  readonly context: ErrorContext;

  constructor(code: ErrorCode, message: string, context: ErrorContext = {}, cause?: unknown) {
    super('Printcraft: ' + message);
    this.name = 'PrintcraftError';
    this.code = code;
    this.hint = HINTS[code];
    this.context = context;
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause;

    // without this, `instanceof PrintcraftError` fails wherever the build target
    // is es5 and Error is a function rather than a class
    Object.setPrototypeOf(this, PrintcraftError.prototype);
  }

  /** Message and hint together, for a log line or a dialog. */
  get detail(): string {
    return this.message + '\n' + this.hint;
  }

  toJSON(): {
    name: string;
    code: ErrorCode;
    message: string;
    hint: string;
    context: ErrorContext;
  } {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      hint: this.hint,
      context: this.context
    };
  }
}

/** Throws a coded error. Never returns, so callers can use it as an expression. */
export function fail(
  code: ErrorCode,
  message: string,
  context?: ErrorContext,
  cause?: unknown
): never {
  throw new PrintcraftError(code, message, context, cause);
}

/** True when `e` is one of ours, optionally of a particular code. */
export function isPrintcraftError(e: unknown, code?: ErrorCode): e is PrintcraftError {
  return e instanceof PrintcraftError && (!code || e.code === code);
}
