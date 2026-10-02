/* Printcraft demo behaviour.
 *
 * A classic script on purpose, not an ES module: the standalone build has to
 * run from file://, where module scripts are blocked by CORS.
 *
 * Everything here is demo scaffolding. None of it is part of the library.
 */
(function () {
  'use strict';

  /* opened straight from disk ---------------------------------------------- */

  var FROM_DISK = location.protocol === 'file:';

  /**
   * The same defaults the linked config file carries, substituted at build time
   * from assets/data/printcraft.config.json so the two cannot drift.
   */
  var CONFIG_FALLBACK = '__DEMO_CONFIG__';

  /**
   * A file:// page has an opaque origin, so it cannot fetch its own siblings.
   * Two things here depend on a fetch: the linked config and the web manifest.
   * Rather than let the page quietly behave differently, apply the same defaults
   * inline and drop the manifest link.
   */
  function handleFileProtocol() {
    var manifest = document.querySelector('link[rel="manifest"]');
    if (manifest && manifest.parentNode) manifest.parentNode.removeChild(manifest);

    var applied = false;
    try {
      if (CONFIG_FALLBACK && typeof CONFIG_FALLBACK === 'object') {
        Printcraft.applyConfig(CONFIG_FALLBACK);
        applied = true;
      }
    } catch (e) {
      console.warn('[demo] could not apply the fallback config', e);
    }

    var note = document.createElement('div');
    note.className = 'prjs-load-note';
    note.setAttribute('role', 'status');
    note.textContent = applied
      ? 'Opened from disk. A file:// page cannot fetch its own files, so the page ' +
        'defaults were applied inline instead of being loaded from ' +
        'printcraft.config.json, and the web manifest was skipped. Every job behaves ' +
        'the same as when served. `npm run demo` serves it properly.'
      : 'Opened from disk. A file:// page cannot fetch its own files, so the defaults ' +
        'in printcraft.config.json did not load: jobs will ignore the page margin, the ' +
        'excluded .no-print elements and the document title. `npm run demo` serves it properly.';

    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'prjs-load-note__close';
    close.setAttribute('aria-label', 'Dismiss');
    close.textContent = '\u00d7';
    close.addEventListener('click', function () {
      note.remove();
    });

    note.appendChild(close);
    document.body.appendChild(note);
  }

  /* the library failed to load -------------------------------------------- */

  if (typeof Printcraft === 'undefined') {
    document.addEventListener('DOMContentLoaded', function () {
      var warn = document.createElement('div');
      warn.className = 'prjs-load-error';
      warn.setAttribute('role', 'alert');
      warn.textContent =
        'This is the repo demo: it loads ../dist/ next to it, so it needs `npm run build` ' +
        'first and must be served from the repo root (npm run demo). For a single file ' +
        'that works offline from anywhere, open dist/demo-standalone.html.';
      document.body.appendChild(warn);
    });
    return;
  }

  /* deterministic sample data --------------------------------------------- */

  /**
   * A tiny seeded generator. The demo doubles as a visual test sheet, so the
   * same page has to produce the same run log and the same chart on every load,
   * Math.random() would make two screenshots incomparable.
   */
  function seeded(seed) {
    var state = seed;
    return function next() {
      state = (state * 1664525 + 1013904223) % 4294967296;
      return state / 4294967296;
    };
  }

  /* a local watermark ------------------------------------------------------ */

  /**
   * Substituted at build time with assets/img/watermark.svg as a data URI. The
   * standalone demo has to run with no network at all, so nothing here may be
   * fetched. See tools/build-assets.mjs.
   */
  var WATERMARK = '__WATERMARK_DATA_URI__';

  /* the job catalogue ------------------------------------------------------ */

  /** Each entry is [title, blurb, options-or-thunk]. */
  var JOBS = [
    ['Print the region', 'Just the report block, nothing else on the page.', { target: '#report' }],

    [
      'Callbacks + promise',
      'Logs before and after, and resolves a promise when the dialog closes.',
      {
        target: '#report',
        beforePrintCb: function () {
          console.log('before print');
        },
        afterPrintCb: function () {
          console.log('after print');
        }
      }
    ],

    [
      'Expose link URLs (all)',
      'Appends every href to its link text.',
      { target: '#report', exposeLinkUrls: 'all' }
    ],

    [
      'Expose links, custom template',
      'External links only, arrow template.',
      { target: '#report', exposeLinkUrls: 'external', linkTextTemplate: '{title} → {url}' }
    ],

    [
      'Keep source CSS',
      'Ships this page’s stylesheets along for the ride.',
      { target: '#report', keepSourceCSS: true }
    ],

    [
      'Exclude a region',
      'Drops everything matching .links and .no-print.',
      { target: '#report', excludeSelectorList: ['.links', '.no-print'] }
    ],

    [
      'Image watermark',
      'A local SVG mark, centred at 20% opacity.',
      { target: '#report', watermarkImageURL: WATERMARK, watermarkOpacity: 0.2 }
    ],

    [
      'Text watermark',
      'No image needed: DRAFT at -30° via generated svg.',
      { target: '#report', watermarkText: 'DRAFT', watermarkOpacity: 0.15 }
    ],

    [
      'Header + footer, every page',
      'Taglines repeated per page via the table technique.',
      {
        target: '#report',
        headerText: 'ACME PRINTWORKS — CONFIDENTIAL',
        footerText: 'Generated by Printcraft',
        headerFooterMode: 'repeat'
      }
    ],

    [
      'Reveal hidden elements',
      'The amber display:none note shows up on paper.',
      { target: '#report', revealHiddenElements: true }
    ],

    [
      'Strip images',
      'Images become bordered placeholders at their rendered size.',
      { target: '#report', removeImages: true }
    ],

    [
      'Strip inline styles',
      'All style attributes removed from the clone.',
      { target: '#report', removeInlineStyles: true }
    ],

    [
      'Canvas capture',
      'The live chart is snapshotted to a png before printing.',
      { target: '#report', printCanvas: true }
    ],

    [
      'Forced page size',
      'A5 landscape with 10mm margins via @page.',
      { target: '#report', setPrintSize: 'A5 landscape', pageMargin: '10mm' }
    ],

    [
      'Expand scrollables',
      'The run log table unrolls fully instead of clipping.',
      { target: '#report', extendScrollableAreas: true }
    ],

    [
      'Inject custom style',
      'Headings go magenta on paper only.',
      { target: '#report', injectCustomStyle: 'h2,h3{color:#e5007d} table{font-size:11px}' }
    ],

    [
      'Custom transforms',
      'Uppercases every h3 and stamps a suffix, chained.',
      {
        target: '#report',
        transforms: [
          {
            selector: 'h3',
            fn: function (el) {
              el.textContent = el.textContent.toUpperCase();
              return el;
            }
          },
          {
            selector: 'h2',
            fn: function (el) {
              el.textContent += ' — PROOF';
              return el;
            }
          }
        ]
      }
    ],

    [
      'Popup window mode',
      'Same job, but in a new window instead of an iframe.',
      { target: '#report', printInIframe: false }
    ],

    [
      'Redact sections',
      'Declassified-file bars over codenames and the routing line, text destroyed.',
      { target: '#memo', redactSelectorList: ['.codename', '.routing'] }
    ],

    [
      'Privacy auto-redact',
      'Emails, phones, SSNs and card numbers blanked by pattern scan.',
      { target: '#memo', privacy: true }
    ],

    [
      'Printer marks',
      'Corner crop marks and a 3mm bleed inset on every page.',
      { target: '#report', printerMarks: true }
    ],

    [
      'Annotations',
      'Note chips from options and data-printcraft-note attributes.',
      { target: '#memo', annotations: [{ selector: '.codename', text: 'confirm clearance' }] }
    ],

    [
      'Fluent chain',
      'job().redact().privacy().marks().watermark().print() in one chain.',
      function () {
        return Printcraft.job('#memo')
          .name('fluent memo')
          .redact('.routing')
          .privacy(true)
          .marks(true)
          .watermark('DECLASSIFIED', 0.12)
          .footer('released under demo act §4')
          .set({ proof: true })
          .print();
      }
    ],

    /* 2.0 ---------------------------------------------------------------- */

    [
      'Real sheets, numbered',
      'The page laid out as A4 with a border, padding and "Page n of m".',
      {
        target: 'body',
        paginate: true,
        pageMargin: '10mm',
        pagePadding: '12mm',
        pageBorder: { width: '1px', style: 'solid', color: '#17181b' },
        pageNumbers: { template: 'Page {page} of {pages}', position: 'bottom-center' },
        pageHeader: 'ACME PRINTWORKS · {date}'
      }
    ],

    [
      'Watermark on every page',
      'Repeating turns pagination on, because a fixed mark only ever paints page one.',
      {
        target: 'body',
        watermark: { text: 'CONFIDENTIAL', repeat: 'every-page', opacity: 0.18 }
      }
    ],

    [
      'Tiled watermark',
      'A grid of marks across each sheet, staggered, at 18% of the sheet width.',
      {
        target: 'body',
        watermark: {
          text: 'COPY',
          repeat: 'tile',
          size: '18%',
          rotate: -30,
          opacity: 0.1,
          tile: { gap: '8%', stagger: true }
        }
      }
    ],

    [
      'Corner watermark',
      'Bottom right, upright, small: a stamp rather than a wash.',
      {
        target: '#report',
        watermark: {
          text: 'v2.0 DRAFT',
          position: 'bottom-right',
          size: '22%',
          rotate: 0,
          opacity: 0.5,
          color: '#e5007d',
          margin: '8mm'
        }
      }
    ],

    [
      'Title and description on the paper',
      'A title reaching only the save-as-PDF filename is invisible on the sheet.',
      {
        target: '#report',
        documentTitle: 'Quarterly production report',
        documentDescription: 'Prepared for the board. Figures are provisional until audit.',
        // the config file turns the heading off, because its title is there for
        // the filename. this ticket is the one that wants it on the paper.
        printHeading: true,
        printHeadingMeta: true
      }
    ],

    [
      'Redaction, verified',
      'The assembled document is re-read for everything redaction destroyed.',
      {
        target: '#memo',
        redactSelectorList: ['.codename', '.routing'],
        privacy: true,
        redactionPolicy: 'strict'
      }
    ],

    [
      'A leak stops the job',
      'A transform puts the secret back after redaction. Nothing prints.',
      function () {
        Printcraft.print({
          proof: true,
          target: '#memo',
          redactSelectorList: ['.codename'],
          transforms: [
            {
              selector: 'h2',
              fn: function (el) {
                el.setAttribute('title', el.ownerDocument.title);
                el.textContent = 'Codename: NIGHTJAR';
                return el;
              }
            }
          ]
        }).catch(function (e) {
          Printcraft.ui.notify({
            title: e.code || 'Stopped',
            message: e.message,
            tone: 'danger'
          });
        });
      }
    ],

    [
      'Stamp the last sheet',
      'afterPaginate hands over the sheets as live elements, so one can be marked.',
      {
        target: 'body',
        paginate: true,
        pageNumbers: true,
        hooks: {
          afterPaginate: function (ctx) {
            var last = ctx.sheets[ctx.sheets.length - 1];
            var mark = ctx.document.createElement('p');
            mark.textContent = '— end of document —';
            mark.setAttribute('style', 'text-align:center;margin-top:2rem;opacity:.6');
            if (last) last.appendChild(mark);
          }
        }
      }
    ]
  ];

  /* rendering -------------------------------------------------------------- */

  function fillRunLog() {
    var tbody = document.getElementById('runlog');
    if (!tbody) return;
    var rand = seeded(20260728);

    for (var i = 1; i <= 25; i++) {
      var tr = document.createElement('tr');
      [String(1000 + i), String(i * 137), String(Math.round(rand() * 400) / 10)].forEach(
        function (value) {
          var td = document.createElement('td');
          td.textContent = value;
          tr.appendChild(td);
        }
      );
      tbody.appendChild(tr);
    }
  }

  function drawChart() {
    var canvas = document.getElementById('chart');
    if (!canvas || typeof canvas.getContext !== 'function') return;

    // jsdom has no canvas; guard so the offline smoke test stays quiet
    var ctx;
    try {
      ctx = canvas.getContext('2d');
    } catch {
      return;
    }
    if (!ctx) return;

    var rand = seeded(19700101);
    var inks = ['#009fe3', '#e5007d', '#ffd500', '#17181b'];
    ctx.fillStyle = '#f2f2ef';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (var b = 0; b < 24; b++) {
      ctx.fillStyle = inks[b % 4];
      var h = 20 + rand() * 100;
      ctx.fillRect(10 + b * 24, canvas.height - h, 16, h);
    }
  }

  function renderTickets() {
    var grid = document.getElementById('tickets');
    if (!grid) return;

    JOBS.forEach(function (job, i) {
      var card = document.createElement('article');
      card.className = 'prjs-ticket';

      var crop = document.createElement('span');
      crop.className = 'prjs-crop';
      crop.setAttribute('aria-hidden', 'true');

      var number = document.createElement('div');
      number.className = 'prjs-ticket__number';
      number.textContent = 'Job ' + String(i + 1).padStart(2, '0');

      var title = document.createElement('h3');
      title.className = 'prjs-ticket__title';
      title.textContent = job[0];

      var blurb = document.createElement('p');
      blurb.className = 'prjs-ticket__blurb';
      blurb.textContent = job[1];

      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn-sm btn-primary prjs-run';
      button.textContent = 'Run job';
      button.addEventListener('click', function () {
        run(i + 1, job[2]);
      });

      [crop, number, title, blurb, button].forEach(function (node) {
        card.appendChild(node);
      });
      grid.appendChild(card);
    });
  }

  function run(number, spec) {
    console.log('job', number, 'started');
    // a person pressed this, so it goes through the proof sheet like every
    // other interactive path; the job's own options still win
    var started =
      typeof spec === 'function' ? spec() : Printcraft.print(Object.assign({ proof: true }, spec));

    started
      .then(function (job) {
        console.log('job', number, job.status, 'in', job.duration + 'ms');
      })
      .catch(function (e) {
        console.error('job', number, 'failed:', e);
      });
  }

  /* controls --------------------------------------------------------------- */

  function on(id, handler) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('click', handler);
    return el;
  }

  /**
   * Attaches a kit tooltip to every control that declares one.
   *
   * The demo uses the library's own rather than `title`, which is the point:
   * whatever a host builds gets the same surface, the same theme and the same
   * accessible-name handling.
   */
  function wireTooltips() {
    var seen = document.querySelectorAll('[data-tip]');
    for (var i = 0; i < seen.length; i++) {
      Printcraft.ui.tooltip(seen[i], { text: seen[i].getAttribute('data-tip') });
    }
  }

  function wireInteractionLayer() {
    // the page's interface installs itself at load, so this only takes it away
    // and puts it back
    var pageMenu = Printcraft.ui.instance;

    on('btn-menu', function () {
      if (pageMenu && pageMenu.isLive) {
        pageMenu.destroy();
        this.textContent = 'Enable right-click menu';
        this.setAttribute('aria-pressed', 'false');
        return;
      }
      pageMenu = Printcraft.ui.instance;
      this.textContent = 'Disable right-click menu';
      this.setAttribute('aria-pressed', 'true');
    });

    on('btn-palette', function () {
      Printcraft.ui.palette();
    });

    on('btn-notes', function () {
      Printcraft.ui.notes();
    });

    on('btn-redact-area', function () {
      Printcraft.ui.redactArea();
    });

    /* two interfaces, one page ------------------------------------------- */

    var panes = [];

    on('btn-scoped', function () {
      if (panes.length) return;
      // the page-wide one has to go, or it would answer for these too
      if (pageMenu && pageMenu.isLive) pageMenu.destroy();

      panes.push(
        Printcraft.ui.create({
          scope: '#pane-invoice',
          title: 'Invoice tools',
          description: 'Print or preview this pane',
          items: ['print-element', 'inspect']
        }),
        Printcraft.ui.create({
          scope: '#pane-legal',
          title: 'Legal tools',
          description: 'Redact before anything leaves the building',
          items: ['redact', 'redact-area', 'notes']
        })
      );
      Printcraft.ui.toast({ message: 'Right-click either pane', tone: 'success' });
    });

    on('btn-scoped-off', function () {
      panes.forEach(function (p) {
        p.destroy();
      });
      panes = [];
      pageMenu = Printcraft.ui.instance;
      Printcraft.ui.toast({ message: 'One menu again, for the whole page' });
    });

    /* backends ------------------------------------------------------------ */

    on('btn-backend-http', function () {
      // this page has no print server, so the point of the button is the error
      Printcraft.backend = Printcraft.httpBackend({ url: '/api/print', retry: 0 });
      Printcraft.print({ target: '#report', assetTimeout: 3000 })
        .then(function (job) {
          Printcraft.ui.toast({
            message: 'Sent: ' + JSON.stringify(job.backend),
            tone: 'success'
          });
        })
        .catch(function (e) {
          Printcraft.ui.notify({
            title: 'No print server here',
            message: e.message,
            tone: 'danger'
          });
        })
        .finally(function () {
          Printcraft.backend = Printcraft.browserBackend;
        });
    });

    on('btn-backend-caps', function () {
      Printcraft.backend.capabilities().then(function (caps) {
        var can = Object.keys(caps).filter(function (k) {
          return caps[k];
        });
        Printcraft.ui.notify({
          title: Printcraft.backend.name + ' backend',
          message: can.length ? 'Can: ' + can.join(', ') : 'Can do none of it without a companion',
          tone: 'primary'
        });
      });
    });

    on('btn-backend-reset', function () {
      Printcraft.backend = Printcraft.browserBackend;
      Printcraft.ui.toast({ message: 'Back to the browser dialog' });
    });

    on('btn-pick', function () {
      Printcraft.ui.pickSections().then(function (r) {
        console.log('picker:', r);
      });
    });

    on('btn-draw', function () {
      Printcraft.ui.drawArea().then(function (r) {
        console.log('draw:', r);
      });
    });

    /* the proof sheet ----------------------------------------------------- */

    on('btn-proof', function () {
      Printcraft.proof({ target: '#report' }).then(function (r) {
        console.log('proof:', r.status);
      });
    });

    on('btn-proof-paginated', function () {
      Printcraft.proof({
        target: 'main',
        paginate: true,
        pageNumbers: { template: 'Page {page} of {pages}' },
        pageMargin: '14mm',
        documentTitle: 'Printcraft demo',
        documentDescription: 'Everything on the page, as it would print.',
        coverPage: true,
        notesPage: true,
        printHeading: false
      }).then(function (r) {
        console.log('proof:', r.status, r.pages + ' sheets');
      });
    });

    on('btn-annotate', function () {
      Printcraft.ui.run('annotate');
    });

    on('btn-pen', function () {
      // the same form the annotation toolbar's Pen button opens
      Printcraft.ui
        .modal({
          title: 'Pen',
          description: 'Colour is Coloris; opacity is part of it',
          icon: 'draw',
          size: 'sm',
          fields: [
            {
              type: 'color',
              name: 'ink',
              label: 'Colour',
              value: 'rgba(220,38,38,1)',
              hint: 'A highlighter is one of these at about 40%'
            },
            { type: 'range', name: 'width', label: 'Stroke', min: 1, max: 24, value: 3, unit: 'px' }
          ],
          actions: [
            { id: 'cancel', label: 'Cancel', tone: 'ghost' },
            { id: 'save', label: 'Use it', tone: 'primary', validates: true }
          ]
        })
        .then(function (r) {
          console.log('pen:', r.action, r.values);
        });
    });
  }

  function wireDevtools() {
    on('btn-inspect', function () {
      Printcraft.inspect({
        target: '#report',
        watermarkText: 'PREVIEW',
        footerText: 'inspector mode'
      });
    });

    on('btn-debug', function () {
      var enabled = !Printcraft.debug();
      Printcraft.debug(enabled);
      this.setAttribute('aria-pressed', String(enabled));
      console.log('[printcraft] debug', enabled ? 'on' : 'off');
    });

    on('btn-report', function () {
      Printcraft.devtools.report();
    });
  }

  function traceBus() {
    var names = [
      'job:start',
      'job:beforeprint',
      'job:done',
      'job:cancel',
      'job:error',
      'config:loaded',
      'trigger'
    ];
    names.forEach(function (name) {
      Printcraft.on(name, function (p) {
        if (Printcraft.debug()) console.log('[bus]', name, p.job ? '#' + p.job.id : '', p);
      });
    });
  }

  /* boot ------------------------------------------------------------------- */

  function init() {
    if (FROM_DISK) handleFileProtocol();
    fillRunLog();
    drawChart();
    renderTickets();

    var customer = document.getElementById('cust');
    if (customer) customer.value = 'Aldus Manutius';

    // ctrl+p / cmd+p prints the clean report instead of the whole page
    Printcraft.bindHotkey({
      target: '#report',
      excludeSelectorList: ['.no-print'],
      footerText: 'Printed via hotkey'
    });

    wireInteractionLayer();
    wireTooltips();
    wireDevtools();
    traceBus();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
