# Override Ctrl+P

Intercept the browser's print shortcut and run a clean job instead of printing the
whole page.

```js
const unbind = Printcraft.bindHotkey({
  target: '#report',
  excludeSelectorList: ['nav', '.no-print'],
  footerText: 'Printed via keyboard shortcut'
});

unbind(); // restore the browser default
```

The handler is registered in the capture phase and matches Ctrl+P or Cmd+P with
no Alt and no Shift, so Ctrl+Shift+P — the devtools command palette in most
browsers — is left alone.

Every hotkey press emits `hotkey` on the global bus before the job starts:

```js
Printcraft.on('hotkey', () => console.log('shortcut intercepted'));
```

## Letting the user opt out

Override, but keep an escape hatch by cancelling when they say no:

```js
Printcraft.bindHotkey({
  target: '#report',
  on: {
    'job:beforeprint': () => confirm('Print just the report? Cancel to print the page.')
  }
});
```

A cancelled job resolves with `status: 'cancelled'` — it does not reject.

## Scoping it

`bindHotkey` binds to `window`, so bind it once and unbind on teardown. In a
single-page app:

```js
let unbind = null;

function enterReportView() {
  unbind = Printcraft.bindHotkey({ target: '#report' });
}

function leaveReportView() {
  unbind?.();
  unbind = null;
}
```

Reference: [Events](../tools/events.md) · [Options](../tools/options.md)

---

[← Docs index](../../README.md#documentation)
