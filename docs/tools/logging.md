# Errors and logging

Stable codes, hints that say what to do, and a buffer that survives the failure.

## Why codes

A message is for reading; a code is for branching on. Messages get reworded as they improve, so anything matching on their text breaks quietly. Codes do not change once published: they can be added, never renamed.

```js
import { isPrintcraftError } from '@simtabi/printcraft';

try {
  await Printcraft.print('#invoice');
} catch (e) {
  if (isPrintcraftError(e, 'PC_POPUP_BLOCKED')) {
    await Printcraft.print({ target: '#invoice', printInIframe: true });
  } else if (isPrintcraftError(e)) {
    report({ code: e.code, hint: e.hint, context: e.context });
  } else {
    throw e;
  }
}
```

`PrintcraftError` extends `Error`, so existing `catch` blocks and error reporters carry on working. The code, hint and context are additions rather than a replacement.

| Field      | What it holds                                                             |
| ---------- | ------------------------------------------------------------------------- |
| `code`     | One of the codes below. Stable.                                           |
| `message`  | What happened, prefixed `Printcraft:`                                     |
| `hint`     | One line on what to change                                                |
| `context`  | Whatever made this one specific: the selector, the timeout, the addresses |
| `cause`    | The underlying error, where there was one                                 |
| `detail`   | Message and hint together, for a log line or a dialog                     |
| `toJSON()` | A plain object, for shipping to a reporter                                |

## The codes

| Code                     | Raised when                                                        |
| ------------------------ | ------------------------------------------------------------------ |
| `PC_TARGET_NOT_FOUND`    | Nothing matched the target selector                                |
| `PC_TARGET_INVALID`      | The target is not a selector or an element                         |
| `PC_TARGET_UNPRINTABLE`  | That tag cannot be a print target                                  |
| `PC_OPTIONS_INVALID`     | An option was the wrong shape or an impossible value               |
| `PC_SELECTOR_INVALID`    | A css selector could not be parsed                                 |
| `PC_SELECTOR_UNSAFE`     | A selector contained characters that would break out of a css rule |
| `PC_CLIP_INVALID`        | The clip rectangle is missing numbers or too small to print        |
| `PC_CONFIG_INVALID`      | A config file or block was not usable                              |
| `PC_CONFIG_UNREACHABLE`  | The config could not be fetched                                    |
| `PC_POPUP_BLOCKED`       | The browser blocked the print window                               |
| `PC_MOUNT_TIMEOUT`       | The print document never became ready                              |
| `PC_RASTERIZE_FAILED`    | The page could not be turned into pixels                           |
| `PC_CLIPBOARD_DENIED`    | The clipboard refused the write                                    |
| `PC_REDACTION_LEAK`      | Redacted content was still in the print document                   |
| `PC_EMAIL_INVALID`       | The message could not be sent as addressed                         |
| `PC_BACKEND_UNSUPPORTED` | The backend cannot do what was asked of it                         |

`Printcraft.CODES` is the same table at runtime.

## Logging

Nobody can reproduce a printer. When a print fails on somebody else's machine, the useful thing is what happened on theirs, which means records have to exist before anyone thought to turn logging on.

So the ring buffer fills whatever the level is. The level only decides what reaches the console.

```js
Printcraft.logger.level('debug'); // silent, error, warn, info, debug, trace
Printcraft.logger.export(); // the buffered records, oldest first
Printcraft.logger.toText(); // the same, ready to paste into an issue
Printcraft.logger.clear();
```

```
12ms  DEBUG [printcraft#1] job 1 "#invoice" start
14ms  DEBUG [printcraft#1] stage: clone (1.8ms)
31ms  WARN  [printcraft#1] could not inline 2 asset(s) ["https://cdn…"]
88ms  DEBUG [printcraft#1] job 1 done in 76ms
```

### Records

```ts
interface LogRecord {
  ts: number; // ms since the library loaded
  level: 'error' | 'warn' | 'info' | 'debug' | 'trace';
  ns: string;
  jobId?: number;
  msg: string;
  data?: unknown[];
}
```

Structured rather than formatted, so a sink can filter or forward without parsing strings back apart.

### Sinks

```js
const detach = Printcraft.logger.sink((record) => {
  if (record.level === 'error' || record.level === 'warn') {
    telemetry.send('print', record);
  }
});

detach(); // stop
```

Every record reaches every sink, whatever the level. A sink that throws is ignored: a broken reporter must not take a print job down with it.

### Debugging one job

```js
Printcraft.print({ target: '#invoice', debug: true });
```

That puts one job's records on the console regardless of the global level. `?printcraft-debug` in the URL, or `localStorage.setItem('printcraft:debug', '1')`, does the same for every job on the page.

The buffer holds the last 500 records. A long-running page cannot grow it without bound.

## Events

```js
Printcraft.on('job:done', ({ job }) => console.log(job.duration + 'ms'));
Printcraft.off('job:done', handler);
Printcraft.once('job:error', handler);
```

Or await one:

```js
const { job } = await Printcraft.waitFor('job:done');
```

`waitFor` rejects after 30 seconds by default, rather than hanging on an event that will never arrive. Pass a second argument to change it.

| Group     | Events                                                                                                                                                                |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Job       | `job:start` `job:measure` `job:clone` `job:transform` `job:mount` `job:assets` `job:beforeprint` `job:afterprint` `job:done` `job:cancel` `job:error` `job:inspected` |
| Pages     | `paginate:start` `paginate:done`                                                                                                                                      |
| Region    | `capture:start` `capture:done`                                                                                                                                        |
| Redaction | `redact:mark` `redact:review` `redact:verify` `redact:leak`                                                                                                           |
| Sharing   | `share:screenshot` `share:copy` `share:email`                                                                                                                         |
| Backend   | `backend:start` `backend:done`                                                                                                                                        |
| Interface | `ui:menu` `ui:pick` `ui:draw` `ui:redact` `ui:annotate`                                                                                                               |
| Setup     | `trigger` `hotkey` `config:loaded` `config:skipped`                                                                                                                   |

Every payload carries `job` and `options` alongside its own fields.

## See also

- [Events](events.md) — payload shapes per event
- [Devtools](devtools.md) — the in-page job inspector
- [Redaction](redaction.md) — what `redact:leak` means and what to do about it

---

[← Docs index](../../README.md#documentation)
