# Memory

What the library remembers between visits, and where it puts it. Off by default.

## Why it exists

Marking a forty-page contract is twenty minutes of work held in `data-` attributes on a live
page, and a stray refresh used to take all of it. Once there is somewhere to put things, the
rest follows: the paper you always pick, the actions you actually use, the region you were
half way through selecting.

```js
const ui = Printcraft.ui.create({ persist: true });
```

That is the whole opt-in. Nothing is written to anyone's browser without it, because a
redaction's neighbouring text is exactly the content someone is trying to control.

## What is remembered

|                   |                                                            |
| ----------------- | ---------------------------------------------------------- |
| **Marks**         | notes, redactions and drawings, anchored to their elements |
| **Options**       | paper, orientation, margins, watermark, the switches       |
| **Configuration** | the resolved set, and which layer set each value           |
| **Activity**      | recent action ids, most recent first                       |
| **Progress**      | a region selection or drawing that was never finished      |

Everything is namespaced by page, so two documents in one app do not inherit each other's
redactions. `scopeKey` overrides the default, which is origin plus path.

## Where it goes

```js
import {
  localStore,
  sessionStore,
  httpStore,
  customStore,
  memoryStore
} from '@simtabi/printcraft/ui';

Printcraft.ui.create({ persist: localStore({ prefix: 'acme:', ttl: 7 * 864e5, limit: 200 }) });
Printcraft.ui.create({ persist: httpStore({ url: '/api/print-state', credentials: 'include' }) });
```

| Store            | Survives           | Notes                                       |
| ---------------- | ------------------ | ------------------------------------------- |
| `memoryStore()`  | nothing            | the default                                 |
| `localStore()`   | a restart          | per origin, `printcraft:` prefixed          |
| `sessionStore()` | a reload           | per tab                                     |
| `httpStore()`    | your server        | `GET` reads, `PUT` writes, `DELETE` removes |
| `customStore()`  | whatever you write | only `get` and `set` are required           |

`localStore` writes an envelope carrying a schema version and a timestamp, so `ttl` and
`limit` work and a future format can migrate rather than throw. A full quota evicts the
oldest records this store owns and retries once; if it still will not fit you get
`PC_STORE_FULL` rather than a silent no-op. `clear()` only removes keys under the prefix,
never the host app's.

`httpStore` is the plainest REST that could work, so it can be implemented in an afternoon
in any language:

```
GET    /api/print-state          → ["marks", "options"]
GET    /api/print-state/marks    → [...]     404 means nothing stored
PUT    /api/print-state/marks    ← [...]
DELETE /api/print-state/marks
```

## Marks that cannot be found again

A page changes. A saved mark is put back only when the element it belongs to can be
identified with confidence, and otherwise it is reported:

```js
const ui = Printcraft.ui.create({
  persist: true,
  onRestore: ({ restored, lost }) => {
    if (lost.length) console.warn(lost.length + ' marks could not be placed', lost);
  }
});

const report = await ui.restored();
```

| Confidence | What it means                                           |
| ---------- | ------------------------------------------------------- |
| `exact`    | the selector matched and the text is unchanged          |
| `likely`   | the selector moved but the text is unchanged and unique |
| `lost`     | neither, so **nothing is applied**                      |

Guessing would eventually mean redacting the wrong paragraph. A privacy tool that does that
once is worse than one that says it does not know.

## Reading and moving it

```js
const bundle = await Printcraft.ui.memory.export();
await other.memory.import(bundle);
await Printcraft.ui.memory.forget(); // this page only
```

`export()` is plain JSON, so a host that wants marks in its own database can take them
without implementing a store.

## Events

```js
Printcraft.on('state:save', ({ what, count }) => {});
Printcraft.on('state:load', ({ restored, lost }) => {});
Printcraft.on('state:lost', ({ marks }) => {});
Printcraft.on('state:clear', ({ what }) => {});
```

## Configuration from a server

Six layers, applied in order, each overriding the last:

`defaults` → `backend` → `file` → `attribute` → `session` → `call`

```js
const config = await Printcraft.ui.config.resolve({
  defaults: { setPrintSize: 'A4' },
  backend: 'https://api.example.com/print-config',
  call: { pageMargin: '20mm' }
});

config.values.pageMargin; // '20mm'
config.from.pageMargin; // 'call'
Printcraft.ui.config.explain(config); // ['pageMargin = 20mm  (call)', …]
```

A source is an object, a url, an async function, or `{ store }`. A layer that throws is
skipped rather than fatal: a config server being down should not stop a page printing.

## Errors

| Code              | When                                                       |
| ----------------- | ---------------------------------------------------------- |
| `PC_NO_STORAGE`   | private browsing, a sandboxed frame, storage switched off  |
| `PC_STORE_FULL`   | the origin is out of room and eviction did not free enough |
| `PC_STORE_FAILED` | the state service answered with an error                   |
| `PC_MARK_LOST`    | a saved mark has no element to sit on                      |

`persist: true` falls back to `memoryStore()` rather than throwing when storage is
unavailable, because remembering nothing is the right answer in a sandboxed frame.

## See also

- [Annotations](annotate.md) — drawings are marks, and persist with the rest
- [The interaction layer](interaction-ui.md) — where `persist` is passed
- [Options](options.md) — every option, grouped by concern

---

[← Docs index](../../README.md#documentation)
