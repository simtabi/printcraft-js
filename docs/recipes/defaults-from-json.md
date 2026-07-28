# Page defaults from JSON

Set the house print style once, and let individual jobs override it.

The simplest form — an inline block, read at boot before any trigger can fire:

```html
<script type="application/json" data-printcraft-config>
  {
    "documentTitle": "ACME reports",
    "pageMargin": "18mm",
    "stripDarkMode": true,
    "excludeSelectorList": [".ads", "nav", "footer"],
    "footerText": "internal — do not distribute"
  }
</script>
<script src="printcraft.umd.js"></script>
```

Every job on the page now inherits those, and any job can still override:

```js
Printcraft.print('#report'); // footer: "internal — …"
Printcraft.print({ target: '#public', footerText: null }); // no footer
```

## From a file

```html
<script src="printcraft.umd.js" data-config="/printcraft.config.json"></script>
```

```json
{
  "documentTitle": "ACME reports",
  "pageMargin": "18mm",
  "excludeSelectorList": [".ads", "nav"]
}
```

A sample ships at `demo/printcraft.config.json`.

> The fetch is asynchronous, so a job triggered in the first milliseconds of page
> life can run before the file lands. Use the inline block when the defaults must
> apply to the very first job.

## At runtime

```js
Printcraft.applyConfig({ watermarkText: 'DRAFT' });
await Printcraft.loadConfig('/printcraft.config.json');
Printcraft.defaults = {}; // reset
```

Confirm a config actually applied:

```js
Printcraft.on('config:loaded', ({ source }) => console.log('config from', source));
```

Reference: [Configuration](../configuration.md)

---

[← Docs index](../../README.md#documentation)
