# Events

Sixteen events, five hooks, and two ways to cancel a job before the dialog opens.

Every job emits on two channels: its own emitter (the fluent instance, or a
private one for static calls) and the global bus. Per-job listeners never leak
onto the bus, so two concurrent jobs cannot see each other's handlers.

## Listening

```js
// globally, for every job on the page
Printcraft.on('job:done', ({ job }) => console.log(job.name, job.duration));
Printcraft.off('job:done', handler);
Printcraft.once('job:error', handler);

// on one builder
Printcraft.job('#invoice').on('job:start', handler).print();

// for one job only, detached automatically when it ends
Printcraft.print({ target: '#invoice', on: { 'job:done': handler } });
```

`off(name, fn)` removes a listener registered with either `on` or `once`.

## The lifecycle

| Event             | When                                       | Payload adds         |
| ----------------- | ------------------------------------------ | -------------------- |
| `job:start`       | The job begins                             | —                    |
| `job:measure`     | Before the live tree is read               | `targets`            |
| `job:clone`       | Clones exist                               | `clones`             |
| `job:transform`   | All transforms have run                    | `clones`             |
| `job:mount`       | The print document is assembled            | `window`, `document` |
| `job:assets`      | Images, fonts and stylesheets have settled | —                    |
| `job:beforeprint` | Last chance to cancel                      | `window`, `document` |
| `job:afterprint`  | The dialog closed                          | —                    |
| `job:done`        | The job finished cleanly                   | —                    |
| `job:cancel`      | The job was cancelled                      | —                    |
| `job:error`       | The job threw                              | `error`              |
| `job:inspected`   | An inspect job resolved                    | `controller`         |

Every payload also carries `job` (the record) and `options` (the resolved
options).

## Other events

| Event           | When                                    | Payload                          |
| --------------- | --------------------------------------- | -------------------------------- |
| `trigger`       | A `data-printcraft` element was clicked | `element`, `options`             |
| `hotkey`        | The Ctrl/Cmd+P override fired           | `event`                          |
| `config:loaded` | Defaults were merged                    | `config`, `source`               |
| `ui:menu`       | The context menu opened                 | `target`                         |
| `ui:pick`       | The picker selection changed            | `selected`                       |
| `ui:draw`       | A print area was drawn                  | `rect`                           |
| `ui:redact`     | Redaction was toggled from the UI       | `element`/`elements`, `redacted` |
| `ui:annotate`   | A note was added from the UI            | `element`, `text`                |

## Hooks

Hooks are single functions rather than a listener list, and they can mutate.

| Hook             | Signature                       | Can                                    |
| ---------------- | ------------------------------- | -------------------------------------- |
| `beforeClone`    | `(targets, options)`            | Inspect the live targets               |
| `transformClone` | `(clone, options)`              | Return an element to replace the clone |
| `beforeAssemble` | `(clones, options)`             | Reorder or edit the clone list         |
| `beforePrint`    | `({window, document, options})` | Return `false` to cancel               |
| `afterPrint`     | `({options})`                   | Clean up                               |

```js
Printcraft.print({
  target: '#invoice',
  hooks: {
    transformClone(clone) {
      clone.querySelectorAll('.draft-only').forEach((el) => el.remove());
    },
    beforePrint({ document }) {
      return document.querySelector('.total') !== null; // false cancels
    }
  }
});
```

## Cancelling

Either a `beforePrint` hook or any `job:beforeprint` listener returning `false`
cancels. The mount is torn down, the dialog never opens, and the promise resolves
with `status: 'cancelled'`. It does not reject.

```js
const job = await Printcraft.print({
  target: '#invoice',
  on: { 'job:beforeprint': () => confirm('Print this?') }
});
job.status; // 'done' or 'cancelled'
```

## Errors

By default a failed job rejects. With `onError` it resolves with the job record
instead, and the error is on `job.error`:

```js
const job = await Printcraft.print({ target: '#missing', onError: console.warn });
job.status; // 'error'
```

Either way the measurement tags are swept off the live page and the mount is torn
down before the error surfaces.

A listener that throws is caught and logged; the rest of the chain still runs.

---

[← Docs index](../../README.md#documentation)
