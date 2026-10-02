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

|              |                                                            |
| ------------ | ---------------------------------------------------------- |
| **Marks**    | notes, redactions and drawings, anchored to their elements |
| **Options**  | paper, orientation, margins, watermark, the switches       |
| **Activity** | recent action ids, most recent first                       |
| **Progress** | a region selection that was drawn and never printed        |

Everything is namespaced by page, so two documents in one app do not inherit each other's
redactions. `scopeKey` overrides the default, which is origin plus path.

- **Options** are written when a job from the interface actually prints (status `done`,
  not a cancelled proof), and read back when the interface is created. They sit _under_
  the interface's own `base` and `configure()`, so a choice the host makes in code always
  wins over one the user made last time. Only the twelve settings above are kept, and only
  in a shape a job accepts; a job that still refuses them with `PC_OPTIONS_INVALID` makes
  the interface forget them, so one failed print is the worst case.
- **Activity** is every action that runs from the menu, the palette, the keyboard or
  `run()`. The palette lifts the five most recent to the top under _Recently used_.
- **Progress** is the region tool's box. Close the tab with a selection drawn and the next
  time the tool opens, the box is where you left it. Printing it, cancelling or starting
  over forgets it. A drawing has no unfinished state to keep: each shape is a mark the
  moment the pointer lifts.

With `persist` off, none of this happens and nothing is written anywhere.

Progress belongs to the interface: the region tool keeps its box when it is opened from a
persisting interface's menu, palette, keys or `run('draw')`. `Printcraft.ui.drawArea()`
called on its own has no memory to keep it in.

Configuration is not remembered. It is resolved when asked for (see below), and a store
can be one of its layers.

Two interfaces on one page share the page's records unless each is given its own
`scopeKey`, so give a second persisting interface one if its paper and recent actions
should be its own.

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
never the host app's. `limit` counts one page's records at a time (keys up to their last
`|`), so a busy page cannot evict another page's marks.

`httpStore` is the plainest REST that could work, so it can be implemented in an afternoon
in any language:

```
GET    /api/print-state          → ["marks", "options"]
GET    /api/print-state/marks    → [...]     404 means nothing stored
PUT    /api/print-state/marks    ← [...]
DELETE /api/print-state/marks
```

A 404 on `PUT` is an error (`PC_STORE_FAILED`), not "nothing stored": it means the url is
wrong. Pass `prefix` to give the store a namespace in a shared collection; `keys()` and
`clear()` then cover only keys under it, and `clear()` deletes them one by one. Without a
prefix `clear()` refuses, because the collection is usually every page's state for that
user; `clear({ all: true })` sends `DELETE` to the collection when that is what you mean.

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

A lost mark is not deleted. It stays in the store and is written back with every later
save, so a later build of the page that has the element again gets it back. `clearMarks()`
and `forget()` are how to let go of them.

Guessing would eventually mean redacting the wrong paragraph. A privacy tool that does that
once is worse than one that says it does not know.

### Elements with no words

An image, a form field or an empty container has no text to compare, and an
`nth-of-type` path points at a different element the moment a sibling of the same tag is
inserted. So an anchor made on one records two more things, and both have to match:

| Field     | What it holds                                                                     |
| --------- | --------------------------------------------------------------------------------- |
| `shape`   | the tag; `src`/`srcset`/`href` file names, `alt`, `name`, `type`, `role`,         |
|           | `aria-label`, `title`, `for`; authored `data-*`; the `width`/`height` ratio; the  |
|           | tags it contains                                                                  |
| `context` | up to 32 characters of text either side of it, from the nearest ancestor with any |

Classes, inline styles and a field's current value are left out: they change when the
element did not. So are `data-` attributes that look generated (`data-v-3f2a1c`, long
numbers or hex runs), a query string on a file name, and Printcraft's own overlay.

The scheme follows the one annotation tools use. The W3C Web Annotation model pairs a
locating selector with a `TextQuoteSelector` whose `prefix` and `suffix` confirm it, and
Hypothesis anchors by trying the structural locator first, checking it against the quote,
and only then searching for the quote elsewhere. Here the selector proposes, the shape
stands in for the quote, and the surrounding text plays `prefix`/`suffix`:

| Confidence | For an element with no words                                                        |
| ---------- | ----------------------------------------------------------------------------------- |
| `exact`    | the selector matched, and the shape and context are unchanged                       |
| `likely`   | the selector missed, and exactly one element on the page has that shape and context |
| `lost`     | anything else                                                                       |

An element so plain that nothing tells it apart — no naming attributes, no children, no
words around it — is trusted only through an `id`, and is otherwise `lost`.

**Anchors saved before 3.0 shipped** carry neither field. They keep the rule they were made
under: an element with no words is matched on its selector, and refused if it has since
gained words.

## Reading and moving it

```js
const bundle = await Printcraft.ui.memory.export();
await other.memory.import(bundle);
await Printcraft.ui.memory.forget(); // this page only
```

`export()` is plain JSON, so a host that wants marks in its own database can take them
without implementing a store.

## When storage misbehaves

A read that returns something other than what was written — another build's format, a
hand-edited store, a truncated write — is skipped entry by entry and never thrown on. A
read or write that fails outright — a full quota, a state service that is down — is
reported as `state:error` and printing carries on. Neither ever surfaces as an unhandled
promise rejection.

## Events

```js
Printcraft.on('state:error', ({ what, error }) => {});
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

| Code              | When                                                        |
| ----------------- | ----------------------------------------------------------- |
| `PC_NO_STORAGE`   | private browsing, a sandboxed frame, storage switched off   |
| `PC_STORE_FULL`   | the origin is out of room and eviction did not free enough  |
| `PC_STORE_FAILED` | the state service answered with an error                    |
| `PC_MARK_LOST`    | reserved; a lost mark is reported, never thrown (see above) |

`persist: true` falls back to `memoryStore()` rather than throwing when storage is
unavailable, because remembering nothing is the right answer in a sandboxed frame.

## See also

- [Annotations](annotate.md) — drawings are marks, and persist with the rest
- [The interaction layer](interaction-ui.md) — where `persist` is passed
- [Options](options.md) — every option, grouped by concern

---

[← Docs index](../../README.md#documentation)
