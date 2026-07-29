// The default backend: the browser's own print dialog.
//
// Needs nothing installed and works everywhere, which is why it is the default.
// It also cannot do any of the things a companion service can, and says so
// honestly through `capabilities()` rather than accepting options it will
// quietly ignore.

import { waitForDialogClose } from '../pipeline/mounts';
import type {
  BackendCapabilities,
  BackendPrintOptions,
  BackendResult,
  PrintBackend
} from './index';
import type { RenderedJob, ResolvedOptions } from '../types';
import { fail } from '../support/errors';

const CAPABILITIES: BackendCapabilities = {
  // every one of these needs a process on the machine. see docs/backends.md.
  silent: false,
  selectPrinter: false,
  copies: false,
  duplex: false,
  trays: false,
  preview: true
};

export const browserBackend: PrintBackend = {
  name: 'browser',

  capabilities(): Promise<BackendCapabilities> {
    return Promise.resolve({ ...CAPABILITIES });
  },

  print(job: RenderedJob, options: BackendPrintOptions = {}): Promise<BackendResult> {
    const win = job.window;
    if (!win) {
      fail(
        'PC_BACKEND_UNSUPPORTED',
        'the browser backend needs a mounted window; it cannot print detached markup'
      );
    }

    if (options.silent) {
      // saying so beats appearing to comply and then showing a dialog anyway
      throw new Error(
        'Printcraft: silent printing needs a companion service on the machine. ' +
          'The browser dialog cannot be skipped from a page. See docs/backends.md.'
      );
    }

    const closed = waitForDialogClose(win, {
      dialogTimeout: options.dialogTimeout
    } as unknown as ResolvedOptions);

    try {
      win.focus();
    } catch {
      /* a cross-origin or already-closed window; printing still works */
    }
    win.print();

    return closed.then(() => ({
      status: 'printed' as const,
      backend: 'browser',
      ...(job.pages == null ? {} : { pages: job.pages })
    }));
  }
};
