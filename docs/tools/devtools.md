# Devtools

Three tools for working on print output without printing anything: an inspector,
a per-stage debug log, and a ring buffer of recent jobs.

## The inspector

`Printcraft.inspect()` runs the identical pipeline into a visible overlay instead
of the print dialog:

```js
const ctl = await Printcraft.inspect({ target: '#invoice', watermarkText: 'PREVIEW' });
```

It opens the [proof sheet](../proof.md), read-only: the assembled print document
in an iframe, with a page rail and a zoom. There used to be a separate inspector
overlay with Print / Log HTML / Close; it answered the same question worse and is
gone. The resolved controller gives you the same thing programmatically:

```js
ctl.document.querySelector('.prjs-target'); // the assembled document
ctl.job.status; // 'inspected'
ctl.job.documentHTML; // the full html, captured
ctl.print(); // open the real dialog
ctl.close(); // dismiss the overlay
```

This is the fastest way to iterate on print styles, and it is what the browser
test suite drives. The print dialog cannot be automated, but everything up to it
can.

## Debug logging

Three ways to switch it on, any one is enough:

```js
Printcraft.debug(true); // api
localStorage.setItem('printcraft:debug', '1'); // sticky, per origin
location.href + '?printcraft-debug'; // per page load
```

A single job can override the global flag with `{ debug: true }` or
`{ debug: false }`.

With it on, each job logs a collapsed group with its mode, target and clip flag,
then a per-stage timing line, then a summary table:

```
[printcraft#3] job 3 "invoice" start
[printcraft#3] stage: clone (1.4ms)
[printcraft#3] stage: transform (3.1ms)
[printcraft#3] stage: assemble (0.9ms)
[printcraft#3] stage: assets (112ms)
[printcraft#3] job 3 done in 2841ms
```

When debug is off, the logger is inert: no formatting cost and no console noise.

## Job records

The last twenty jobs are kept in a ring buffer:

```js
Printcraft.devtools.jobs; // the records
Printcraft.devtools.last(); // the most recent
Printcraft.devtools.report(); // console.table, and returns the rows
Printcraft.devtools.clear();
Printcraft.devtools.maxJobs = 50;
```

Each record carries `id`, `name`, `mode`, `status`, `timings`, `targetCount`,
`redactions`, `duration`, and `error`. `documentHTML` is captured in debug and
inspect modes.

```js
Printcraft.devtools.enable(); // same as Printcraft.debug(true)
Printcraft.devtools.disable();
Printcraft.devtools.isEnabled();
```

## Watching the bus

Every stage of every job emits on the global bus, which makes a one-line tracer
possible:

```js
['job:start', 'job:clone', 'job:transform', 'job:mount', 'job:assets', 'job:done'].forEach((n) =>
  Printcraft.on(n, (p) => console.log(n, '#' + p.job.id))
);
```

See [Events](events.md) for the full list.

---

[← Docs index](../../README.md#documentation)
