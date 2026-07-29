# Print backends

Where a finished job goes, why silent printing needs something installed, and what a companion service would look like.

## The platform limit

`window.print()` hands off to the browser's own dialog. There is no API to style it, skip it, pre-fill it, or name a destination, and no library can change that. A page that could print silently to any device on the machine would be a nuisance at best, so the restriction is deliberate rather than an oversight.

That leaves one route to silent printing, choosing a printer from code, or reading a device's trays: a service running on the machine that the browser can reach over the network. A page cannot start a process, and it cannot open a raw socket. It can open a WebSocket to `127.0.0.1`, and that is the whole mechanism.

[QZ Tray](https://qz.io) has done exactly this for point-of-sale and label printing since 2013. The shape is proven; what follows is how Printcraft would adopt it.

## What Printcraft owns today

Everything up to the handoff:

| Decision                            | Where it is made                          |
| ----------------------------------- | ----------------------------------------- |
| Paper size and orientation          | `setPrintSize`                            |
| Margins, borders, padding           | `pageMargin`, `pageBorder`, `pagePadding` |
| Page numbers, running headers       | `pageNumbers`, `pageHeader`, `pageFooter` |
| What gets left out                  | `excludeSelectorList`                     |
| What gets destroyed                 | `redactSelectorList`, `privacy`           |
| Watermarks                          | `watermark`                               |
| The browser's own header and footer | `hideBrowserHeaderFooter`                 |
| A true-scale preview                | `Printcraft.inspect()`                    |

By the time the browser's dialog appears, the only settings still living there are the destination, the copy count, and whether to print backgrounds.

## The seam

Backends are an interface, so the browser and a future companion answer the same call:

```js
const backend = Printcraft.backend; // browserBackend by default
const caps = await backend.capabilities();
// { silent: false, selectPrinter: false, copies: false,
//   duplex: false, trays: false, preview: true }
```

Nothing changes at the call site when you swap one in:

```js
Printcraft.backend = bridgeBackend({ url: 'wss://127.0.0.1:8443', origin: location.origin });

await Printcraft.print('#label'); // uses the new backend
await Printcraft.job('#label').via(bridgeBackend()).print(); // or per job
```

### The interface

```ts
interface PrintBackend {
  readonly name: string;
  capabilities(): Promise<BackendCapabilities>;
  printers?(): Promise<PrinterInfo[]>;
  print(job: RenderedJob, options?: BackendPrintOptions): Promise<BackendResult>;
}
```

`print` receives a `RenderedJob`, never a selector and never the live page:

```ts
interface RenderedJob {
  id: string;
  title: string;
  html: string; // the assembled document
  sheet: { width: number; height: number; name: string };
  pages: number | null;
  document?: Document; // in-page backends only
  window?: Window;
}
```

That constraint is the design, not a convenience. The markup has already been through the transform chain, so exclusions, redaction, privacy scanning and the sanitiser have all run before a backend can see it. A backend that took a selector and fetched the content itself could ship the unredacted original, which would quietly undo the one guarantee this library makes.

## Which language for the companion

|                       | Install cost                                         | Notes                                                                                                                                                                   |
| --------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Go**                | One static binary. No runtime.                       | Cross-compiles to macOS, Windows, Linux and the BSDs from one machine. Small, starts instantly, and matches the release tooling already used across the org.            |
| Node                  | ~40 MB bundled with `pkg`, or Node already installed | Same capability, larger download, slower cold start. Reasonable if the team is already shipping Node desktop tooling.                                                   |
| Python                | A runtime the user must have or you must bundle      | The weakest distribution story of the four. Fine for an internal deployment where the machines are known.                                                               |
| Java                  | A JRE                                                | The QZ Tray path, and the reason QZ Tray asks users to install Java. A hard sell in 2026 unless the fleet already runs it.                                              |
| Server-side rendering | A server you operate                                 | Gives perfect pagination through headless Chromium, but the content leaves the browser. Wrong for a library whose selling point is that redacted content never travels. |

**Go**, when it is built, as a separate `printcraft-bridge` repository rather than part of this package. Most people printing an invoice from a web app should not be asked to install anything, which is exactly why the browser backend is the default and the companion is opt-in.

## What a bridge would look like

A sketch, so the interface above can be judged against something concrete.

### Protocol

A WebSocket on loopback, JSON frames, request/response with an `id`:

| Frame          | Direction        | Purpose                                         |
| -------------- | ---------------- | ----------------------------------------------- |
| `hello`        | client → service | Origin, library version, requested capabilities |
| `welcome`      | service → client | Service version, whether this origin is trusted |
| `capabilities` | client → service | What this installation can do                   |
| `printers`     | client → service | Enumerate devices, trays and status             |
| `print`        | client → service | The `RenderedJob` plus destination options      |
| `status`       | service → client | Queued, spooled, printed, failed                |

### Security

A localhost service that any page can reach is a liability if it is careless. The rules are not optional:

- **Bind to loopback only.** Never `0.0.0.0`. A service on the LAN is a print server nobody asked for.
- **Allowlist origins.** Every request carries its `Origin`. Unknown origins are refused, not prompted, unless the user is present.
- **Ask once, per origin, in the service's own UI.** A page must never be able to grant itself permission.
- **Sign requests** where an installation is unattended: a per-origin key established at pairing, an HMAC over the frame, and a nonce so a captured frame cannot be replayed.
- **Render, do not execute.** The service receives markup and rasterises or spools it. It does not evaluate scripts, follow arbitrary URLs, or read the filesystem on a page's say-so.
- **Cap the job size** and rate-limit per origin, so a hostile page cannot fill a spool queue or a disk.
- **Log every job** with its origin, so an operator can see what asked for what.

### Capabilities it would unlock

Silent printing · naming a destination · copies and duplex · selecting a tray, which is what label and cheque printing need · reading printer status before sending · raw ZPL and ESC/POS for thermal devices · a tray icon showing what has been printed and by whom.

## Writing your own

Nothing about the interface is reserved. A backend that posts to your own print server is a few lines:

```js
const serverBackend = {
  name: 'acme-print-server',
  capabilities: async () => ({
    silent: true,
    selectPrinter: true,
    copies: true,
    duplex: true,
    trays: false,
    preview: false
  }),
  printers: async () => (await fetch('/api/printers')).json(),
  async print(job, options = {}) {
    const res = await fetch('/api/print', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // job.html is the redacted, transformed document, not the page
      body: JSON.stringify({ html: job.html, sheet: job.sheet, ...options })
    });
    if (!res.ok) throw new Error('the print server refused the job: ' + res.status);
    const { id } = await res.json();
    return { status: 'queued', backend: 'acme-print-server', jobId: id, pages: job.pages };
  }
};

Printcraft.backend = serverBackend;
```

Two things to weigh before you do. Sending `job.html` to a server means the content leaves the browser, so satisfy yourself that the redaction it carries is the redaction you intended — [security.md](security.md) covers what is guaranteed. And a backend that reports `silent: true` while showing a dialog will make callers distrust `capabilities()` generally, so report what is true.

## Events

```js
Printcraft.on('backend:start', ({ backend }) => console.log('handing off to', backend));
Printcraft.on('backend:done', ({ status, jobId, pages }) => console.log(status, jobId, pages));
```

The result also lands on the job record:

```js
const record = await Printcraft.print('#invoice');
record.backend; // { status: 'printed', backend: 'browser', pages: 3 }
```

---

[← Docs index](../README.md#documentation)
