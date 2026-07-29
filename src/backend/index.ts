// Where a finished job actually goes.
//
// `window.print()` always hands off to the browser's own dialog. There is no API
// to style it, skip it, pre-fill it or choose a printer, and that is a platform
// decision rather than an oversight: a page that could print silently to any
// device would be a menace. Everything up to that handoff is ours; the handoff
// itself is not.
//
// Which leaves one route to silent printing, choosing a destination from code, or
// reading a printer's trays: a companion service on the machine, listening on
// localhost, that the user installs on purpose. QZ Tray has done exactly this for
// point-of-sale and label printing for years, so the shape is proven.
//
// This file is the seam for that. The browser backend is the default and needs
// no install; a bridge backend can be dropped in without a single caller
// changing. See docs/backends.md for the protocol and the security model.

import type { RenderedJob } from '../types';

export interface BackendCapabilities {
  /** send a job without any dialog appearing */
  silent: boolean;
  /** name the destination from code */
  selectPrinter: boolean;
  copies: boolean;
  duplex: boolean;
  trays: boolean;
  /** show the result before it goes anywhere */
  preview: boolean;
}

export interface PrinterInfo {
  id: string;
  name: string;
  isDefault?: boolean;
  status?: 'ready' | 'busy' | 'offline' | 'error';
  trays?: string[];
}

export interface BackendPrintOptions {
  /** a printer id from `printers()`; ignored by backends that cannot choose */
  printer?: string;
  copies?: number;
  duplex?: 'one-sided' | 'two-sided-long-edge' | 'two-sided-short-edge';
  tray?: string;
  /** skip the dialog. only honoured where `capabilities().silent` is true. */
  silent?: boolean;
  /** how long to wait for a dialog to close before assuming it did */
  dialogTimeout?: number;
  signal?: AbortSignal;
}

export interface BackendResult {
  status: 'printed' | 'cancelled' | 'queued';
  /** which backend answered */
  backend: string;
  /** the backend's own identifier for the job, where it has one */
  jobId?: string;
  pages?: number;
}

/**
 * A destination for finished jobs.
 *
 * `print` receives the transformed, sanitised, redacted output and nothing else.
 * That is the important constraint: a backend never sees the live page, so
 * anything redaction removed is already gone before a job can leave the browser.
 * A backend that took a selector and fetched the content itself would undo the
 * one guarantee this library makes.
 */
export interface PrintBackend {
  readonly name: string;
  capabilities(): Promise<BackendCapabilities>;
  /** absent on backends that cannot enumerate devices, such as the browser */
  printers?(): Promise<PrinterInfo[]>;
  print(job: RenderedJob, options?: BackendPrintOptions): Promise<BackendResult>;
}

export type { RenderedJob };
export { browserBackend } from './browser';
