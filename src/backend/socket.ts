// Talking to a companion service on the machine.
//
// This is the protocol docs/backends.md describes, as a client. A page cannot
// start a process or open a raw socket; it can open a WebSocket to 127.0.0.1,
// and that is the whole mechanism behind every silent-printing tool that has
// ever worked in a browser, QZ Tray included.
//
// The frames are request/response with an id, over one connection that is opened
// lazily and reused. Nothing here assumes our own service on the other end: a
// print server that speaks these five verbs works, whatever it is written in.

import { fail } from '../support/errors';
import type {
  BackendCapabilities,
  BackendPrintOptions,
  BackendResult,
  PrintBackend,
  PrinterInfo
} from './index';
import type { RenderedJob } from '../types';

export interface SocketBackendOptions {
  /** `wss://127.0.0.1:8443`, or whatever the service listens on */
  url: string;
  /** sent with `hello`, so the service can check its allowlist */
  origin?: string;
  /** the default destination, when a job does not name one */
  printer?: string;
  /** milliseconds to wait for a reply before giving up on it */
  timeout?: number;
  /** how many times to retry the connection before failing */
  retry?: number;
  /**
   * Signs the payload of every frame.
   *
   * An unattended installation needs this: without it, any page that reaches
   * localhost can print. See the security section of docs/backends.md.
   */
  sign?: (payload: string) => string | Promise<string>;
  /** for tests, and for a host that manages its own socket */
  socket?: (url: string) => WebSocketLike;
}

/** The part of WebSocket this uses, so a test can stand one up. */
export interface WebSocketLike {
  send(data: string): void;
  close(): void;
  addEventListener(type: string, fn: (ev: { data?: unknown }) => void): void;
  removeEventListener?(type: string, fn: (ev: { data?: unknown }) => void): void;
  readyState?: number;
}

interface Frame {
  id: number;
  type: string;
  [key: string]: unknown;
}

const OPEN = 1;

/**
 * One connection, opened on demand and shared by every call.
 *
 * Reused rather than opened per job, because a service that has to re-verify an
 * origin on every print is a service that prompts on every print.
 */
class Connection {
  private socket: WebSocketLike | null = null;
  private ready: Promise<WebSocketLike> | null = null;
  private nextId = 0;
  private readonly pending = new Map<
    number,
    {
      resolve: (frame: Frame) => void;
      reject: (e: unknown) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  constructor(private readonly options: SocketBackendOptions) {}

  private open(): Promise<WebSocketLike> {
    if (this.ready) return this.ready;

    this.ready = new Promise<WebSocketLike>((resolve, reject) => {
      let socket: WebSocketLike;
      try {
        socket = this.options.socket
          ? this.options.socket(this.options.url)
          : (new WebSocket(this.options.url) as unknown as WebSocketLike);
      } catch (e) {
        reject(e);
        return;
      }

      const timer = setTimeout(() => {
        reject(
          new Error('the service did not answer within ' + (this.options.timeout ?? 8000) + 'ms')
        );
        try {
          socket.close();
        } catch {
          /* already gone */
        }
      }, this.options.timeout ?? 8000);

      socket.addEventListener('message', (ev) => this.onMessage(ev));
      socket.addEventListener('error', () => {
        clearTimeout(timer);
        this.reset(new Error('the connection to ' + this.options.url + ' failed'));
        reject(new Error('could not connect to ' + this.options.url));
      });
      socket.addEventListener('close', () => {
        clearTimeout(timer);
        this.reset(new Error('the service closed the connection'));
      });
      socket.addEventListener('open', () => {
        clearTimeout(timer);
        this.socket = socket;
        resolve(socket);
      });
    });

    return this.ready;
  }

  /** Clears the connection and fails everything still waiting on it. */
  private reset(reason: unknown): void {
    this.socket = null;
    this.ready = null;
    for (const [, waiter] of this.pending) {
      clearTimeout(waiter.timer);
      waiter.reject(reason);
    }
    this.pending.clear();
  }

  private onMessage(ev: { data?: unknown }): void {
    let frame: Frame;
    try {
      frame = JSON.parse(String(ev.data)) as Frame;
    } catch {
      return; // not ours, or not json
    }

    const waiter = this.pending.get(frame.id);
    if (!waiter) return;
    this.pending.delete(frame.id);
    clearTimeout(waiter.timer);

    if (frame.type === 'error') {
      waiter.reject(new Error(String(frame['message'] || 'the service refused the request')));
    } else {
      waiter.resolve(frame);
    }
  }

  /** Sends a frame and waits for the reply with the same id. */
  async send(type: string, payload: Record<string, unknown> = {}): Promise<Frame> {
    const socket = await this.open();
    if (socket.readyState !== undefined && socket.readyState !== OPEN) {
      this.reset(new Error('the connection closed'));
      return this.send(type, payload);
    }

    const id = ++this.nextId;
    const body = JSON.stringify({ id, type, ...payload });
    const frame = this.options.sign
      ? JSON.stringify({ id, type, ...payload, signature: await this.options.sign(body) })
      : body;

    return new Promise<Frame>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('the service did not answer "' + type + '" in time'));
      }, this.options.timeout ?? 30_000);

      this.pending.set(id, { resolve, reject, timer });
      try {
        socket.send(frame);
      } catch (e) {
        this.pending.delete(id);
        clearTimeout(timer);
        reject(e);
      }
    });
  }

  close(): void {
    try {
      this.socket?.close();
    } catch {
      /* already gone */
    }
    this.reset(new Error('closed by the page'));
  }
}

/**
 * A backend that speaks to a companion service over localhost.
 *
 * ```js
 * Printcraft.backend = socketBackend({ url: 'wss://127.0.0.1:8443' });
 * const printers = await Printcraft.backend.printers();
 * await Printcraft.print({ target: '#label', backendOptions: { printer: printers[0].id } });
 * ```
 *
 * Nothing here installs anything. Without a service listening, the first call
 * fails with a message saying so. See docs/backends.md.
 */
export function socketBackend(options: SocketBackendOptions): PrintBackend & { close(): void } {
  if (!options.url) fail('PC_OPTIONS_INVALID', 'socketBackend needs a url to connect to');

  const conn = new Connection(options);
  let greeted = false;

  /** The handshake, sent once per connection. */
  async function hello(): Promise<void> {
    if (greeted) return;
    await conn.send('hello', {
      origin: options.origin || (typeof location === 'undefined' ? '' : location.origin),
      client: 'printcraft'
    });
    greeted = true;
  }

  const explain = (e: unknown): never =>
    fail(
      'PC_BACKEND_UNSUPPORTED',
      'no print service answered at ' +
        options.url +
        ': ' +
        (e instanceof Error ? e.message : String(e)) +
        '. It has to be installed and running on this machine.',
      { url: options.url },
      e
    );

  return {
    name: 'socket',

    async capabilities(): Promise<BackendCapabilities> {
      try {
        await hello();
        const frame = await conn.send('capabilities');
        return {
          silent: true,
          selectPrinter: true,
          copies: true,
          duplex: true,
          trays: true,
          preview: false,
          ...(frame['capabilities'] as Partial<BackendCapabilities>)
        };
      } catch (e) {
        return explain(e);
      }
    },

    async printers(): Promise<PrinterInfo[]> {
      try {
        await hello();
        const frame = await conn.send('printers');
        return (frame['printers'] as PrinterInfo[]) || [];
      } catch (e) {
        return explain(e);
      }
    },

    async print(job: RenderedJob, printOptions: BackendPrintOptions = {}): Promise<BackendResult> {
      try {
        await hello();
        const frame = await conn.send('print', {
          job: {
            id: job.id,
            title: job.title,
            html: job.html,
            sheet: job.sheet,
            pages: job.pages
          },
          options: {
            printer: printOptions.printer || options.printer,
            copies: printOptions.copies ?? 1,
            ...(printOptions.duplex ? { duplex: printOptions.duplex } : {}),
            ...(printOptions.tray ? { tray: printOptions.tray } : {}),
            silent: printOptions.silent !== false
          }
        });

        return {
          status: (frame['status'] as BackendResult['status']) || 'queued',
          backend: 'socket',
          ...(frame['jobId'] ? { jobId: String(frame['jobId']) } : {}),
          ...(job.pages ? { pages: job.pages } : {})
        };
      } catch (e) {
        return explain(e);
      }
    },

    /** Drops the connection. The next call opens a new one. */
    close(): void {
      greeted = false;
      conn.close();
    }
  };
}
