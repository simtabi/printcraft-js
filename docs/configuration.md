# Configuration

How page-wide defaults are set, where they come from, and how they combine with
per-job options.

## Precedence

Three layers, merged shallowly in this order:

```
DEFAULTS  <  Printcraft.defaults  <  per-call options
```

`DEFAULTS` is the library baseline. `Printcraft.defaults` is the house style for
a page, whatever set it. Per-call options always win.

```js
Printcraft.applyConfig({ footerText: 'internal', pageMargin: '18mm' });

Printcraft.print('#a'); // footer: "internal"
Printcraft.print({ target: '#b', footerText: '' }); // footer: none
```

## Setting defaults

### An inline JSON block

Read automatically at boot, before any trigger fires:

```html
<script type="application/json" data-printcraft-config>
  {
    "documentTitle": "ACME invoices",
    "pageMargin": "18mm",
    "stripDarkMode": true,
    "excludeSelectorList": [".ads", "nav", "footer"]
  }
</script>
```

### A linked config file

```html
<script src="printcraft.umd.js" data-config="/printcraft.config.json"></script>
```

The fetch is asynchronous, so a job triggered in the first few milliseconds of
page life may run before the file lands. Use the inline block when the defaults
must apply to the very first job.

A sample file ships at `demo/printcraft.config.json`.

### At runtime

```js
Printcraft.applyConfig({ watermarkText: 'DRAFT' }); // merge an object
await Printcraft.loadConfig('/printcraft.config.json'); // merge a fetched file
Printcraft.defaults; // read the live object
Printcraft.defaults = {}; // reset entirely
```

Both emit `config:loaded` on the global bus with a `source` of `'object'` or the
URL, which is useful for confirming that a config actually applied:

```js
Printcraft.on('config:loaded', ({ source, config }) => {
  console.log('config from', source, config);
});
```

## Configurable by attribute instead

Anything a config file can set, a trigger can set for one job. See
[Surfaces](surfaces.md) for the attribute form and its type coercion. Content
annotations (`data-printcraft-exclude`, `-break-before`, `-redact`, `-note`, …)
are honoured regardless of how the job was described, so they are the right place
for rules that belong to the content rather than to a particular job.

## Turning the auto-boot off

```html
<script src="printcraft.umd.js" data-auto-init="false"></script>
```

Nothing is installed until you ask:

```js
const teardown = Printcraft.initDeclarative(); // delegated triggers
teardown(); // and remove them again
```

## Debug configuration

Three ways to turn on per-stage timing logs, any of which is enough:

```js
Printcraft.debug(true); // api
localStorage.setItem('printcraft:debug', '1'); // sticky, per origin
location.href + '?printcraft-debug'; // per page load
```

A single job can opt in or out regardless: `{ debug: true }` beats the global
flag. See [Devtools](tools/devtools.md).

---

[← Docs index](../README.md#documentation)
