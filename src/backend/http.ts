// Sending a finished job to your own server.
//
// The common shape once printing stops being a thing the browser does: a service
// that turns the document into a PDF, files it, queues it for a warehouse
// printer, or all three. It has no opinion about what yours does, only about the
// envelope.
//
// What travels is `RenderedJob.html` — the assembled, transformed, redacted
// document. Not a selector, not the live page. A backend that could resolve
// content itself would be able to ship the original past redaction.

import { fail } from '../support/errors';
import type {
  BackendCapabilities,
  BackendPrintOptions,
  BackendResult,
  PrintBackend,
  PrinterInfo
} from './index';
import type { RenderedJob } from '../types';

export interface HttpBackendOptions {
  /** where a job is posted */
  url: string;
  /** where `printers()` reads from. omit and the backend reports it cannot list. */
  printersUrl?: string;
  /** where `capabilities()` reads from. omit and the values below are used. */
  capabilitiesUrl?: string;
  /** merged into every request; a function is called per request, for a fresh token */
  headers?:
    Record<string, string> | (() => Record<string, string> | Promise<Record<string, string>>);
  /** `include` when the endpoint is a different origin behind a cookie */
  credentials?: RequestCredentials;
  /** milliseconds before a request is abandoned */
  timeout?: number;
  /** how many times a failed request is retried. network errors and 5xx only. */
  retry?: number;
  /** what this endpoint can do, when it does not say for itself */
  capabilities?: Partial<BackendCapabilities>;
  /** reshape the request body for an endpoint with its own schema */
  serialize?: (job: RenderedJob, options: BackendPrintOptions) => unknown;
  fetch?: typeof fetch;
}

const DEFAULT_CAPABILITIES: BackendCapabilities = {
  // a server can do all of this; whether yours does is for it to say
  silent: true,
  selectPrinter: true,
  copies: true,
  duplex: true,
  trays: false,
  preview: false
};

/** A status worth trying again: a network blip or a server that fell over. */
function retryable(status: number | null): boolean {
  return status === null || status === 408 || status === 429 || status >= 500;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Posts to `url`, with a timeout, a retry budget, and an abort that is honoured.
 *
 * Retries back off, because a server that just returned 503 is not helped by
 * three more requests in the same millisecond.
 */
async function request(
  url: string,
  init: RequestInit,
  options: HttpBackendOptions,
  signal?: AbortSignal
): Promise<Response> {
  const doFetch = options.fetch || fetch;
  const attempts = Math.max(0, options.retry ?? 1) + 1;
  let lastError: unknown = null;

  // sequential on purpose: a retry only means anything after the one before it
  // failed, and firing them together would be three requests, not one retried
  // oxlint-disable no-await-in-loop
  for (let attempt = 0; attempt < attempts; attempt++) {
    const controller = typeof AbortController === 'undefined' ? null : new AbortController();
    const timer = controller
      ? setTimeout(() => controller.abort(), options.timeout ?? 30_000)
      : undefined;

    // the caller's abort has to win over ours
    const onAbort = (): void => controller?.abort();
    signal?.addEventListener('abort', onAbort, { once: true });

    try {
      const res = await doFetch(url, {
        ...init,
        ...(options.credentials ? { credentials: options.credentials } : {}),
        ...(controller ? { signal: controller.signal } : {})
      });
      if (res.ok || !retryable(res.status)) return res;
      lastError = new Error('the print service returned ' + res.status);
    } catch (e) {
      if (signal?.aborted) throw e;
      lastError = e;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }

    if (attempt < attempts - 1) await sleep(250 * 2 ** attempt);
  }
  // oxlint-enable no-await-in-loop

  return fail(
    'PC_BACKEND_UNSUPPORTED',
    'could not reach the print service at ' +
      url +
      ': ' +
      (lastError instanceof Error ? lastError.message : String(lastError)),
    { url },
    lastError
  );
}

async function resolveHeaders(options: HttpBackendOptions): Promise<Record<string, string>> {
  const base = { 'content-type': 'application/json' };
  if (!options.headers) return base;
  const extra = typeof options.headers === 'function' ? await options.headers() : options.headers;
  return { ...base, ...extra };
}

/**
 * A backend that posts finished jobs to an endpoint you run.
 *
 * ```js
 * Printcraft.backend = httpBackend({ url: '/api/print', retry: 2 });
 * await Printcraft.print('#invoice');
 * ```
 *
 * The default body is `{ id, title, html, sheet, pages, options }`. Pass
 * `serialize` for an endpoint with its own schema.
 */
export function httpBackend(options: HttpBackendOptions): PrintBackend {
  if (!options.url) fail('PC_OPTIONS_INVALID', 'httpBackend needs a url to post to');
  let cached: BackendCapabilities | null = null;

  return {
    name: 'http',

    async capabilities(): Promise<BackendCapabilities> {
      if (cached) return cached;

      if (options.capabilitiesUrl) {
        try {
          const res = await request(
            options.capabilitiesUrl,
            { method: 'GET', headers: await resolveHeaders(options) },
            { ...options, retry: 0 }
          );
          if (res.ok) {
            const said = { ...DEFAULT_CAPABILITIES, ...(await res.json()) };
            cached = said;
            return said;
          }
        } catch {
          // an endpoint that will not say falls back to what was configured,
          // rather than failing a print before it starts
        }
      }
      const fallback = { ...DEFAULT_CAPABILITIES, ...options.capabilities };
      cached = fallback;
      return fallback;
    },

    ...(options.printersUrl
      ? {
          async printers(): Promise<PrinterInfo[]> {
            const res = await request(
              options.printersUrl!,
              { method: 'GET', headers: await resolveHeaders(options) },
              options
            );
            if (!res.ok) {
              fail('PC_BACKEND_UNSUPPORTED', 'the print service returned ' + res.status, {
                url: options.printersUrl
              });
            }
            return (await res.json()) as PrinterInfo[];
          }
        }
      : {}),

    async print(job: RenderedJob, printOptions: BackendPrintOptions = {}): Promise<BackendResult> {
      const body = options.serialize
        ? options.serialize(job, printOptions)
        : {
            id: job.id,
            title: job.title,
            html: job.html,
            sheet: job.sheet,
            pages: job.pages,
            options: {
              ...(printOptions.printer ? { printer: printOptions.printer } : {}),
              ...(printOptions.copies ? { copies: printOptions.copies } : {}),
              ...(printOptions.duplex ? { duplex: printOptions.duplex } : {}),
              ...(printOptions.tray ? { tray: printOptions.tray } : {})
            }
          };

      const res = await request(
        options.url,
        {
          method: 'POST',
          headers: await resolveHeaders(options),
          body: JSON.stringify(body)
        },
        options,
        printOptions.signal
      );

      if (!res.ok) {
        fail('PC_BACKEND_UNSUPPORTED', 'the print service refused the job with ' + res.status, {
          url: options.url,
          status: res.status
        });
      }

      // a service that returns nothing has still accepted it
      let payload: { id?: string; jobId?: string; status?: string; pages?: number } = {};
      try {
        payload = (await res.json()) as typeof payload;
      } catch {
        /* an empty 200 is a valid answer */
      }

      return {
        status: (payload.status as BackendResult['status']) || 'queued',
        backend: 'http',
        ...(payload.jobId || payload.id ? { jobId: payload.jobId || payload.id } : {}),
        ...((payload.pages ?? job.pages) ? { pages: payload.pages ?? job.pages ?? undefined } : {})
      };
    }
  };
}
