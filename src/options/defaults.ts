// the baseline every job starts from, and the mutable ref behind
// `Printcraft.defaults`.

import { DEFAULT_REDACT_CHAR } from '../privacy/redact';
import type { PrintcraftOptions, ResolvedOptions } from '../types';

export const DEFAULTS: ResolvedOptions = {
  target: null,
  html: null,
  documentTitle: null,
  jobName: null,

  printInIframe: true,
  windowFeatures: 'width=900,height=650',

  setPrintSize: null,
  pageMargin: null,
  pageBreakBetweenTargets: true,
  pageBreakBeforeSelectors: [],
  pageBreakAfterSelectors: [],
  avoidBreakSelectors: [],

  beforePrintCb: null,
  afterPrintCb: null,
  onError: null,
  assetTimeout: 8000,
  extraDelay: 0,
  afterPrintTimeout: 60000,

  on: null,
  hooks: {},

  exposeLinkUrls: null,
  linkTextTemplate: '{title} [{url}]',

  keepSourceCSS: false,
  keepInlineStyles: true,
  removeInlineStyles: false,
  injectCustomStyle: null,
  stripDarkMode: false,

  watermarkImageURL: null,
  watermarkText: null,
  watermarkOpacity: 0.25,
  watermarkAngle: -30,

  headerText: null,
  footerText: null,
  headerFooterMode: 'repeat',

  revealHiddenElements: false,
  printCanvas: true,
  extendScrollableAreas: false,
  scrollableAreasMaxHeight: null,
  excludeSelectorList: [],
  removeImages: false,
  forceLazyImages: true,
  flattenShadowDom: false,
  preserveFormState: true,
  customMethodMap: null,
  transforms: [],

  // security + privacy
  sanitize: true,
  redactSelectorList: [],
  redactChar: DEFAULT_REDACT_CHAR,
  privacy: null,

  // print production
  printerMarks: null,
  annotations: [],
  clipRect: null,
  clipSourceWidth: null,
  clipMode: 'capture',

  debug: null
};

/**
 * a mutable ref rather than a plain export, so `Printcraft.defaults` can be an
 * assignable static while normalization always reads the live object.
 */
export const defaultsRef: { current: PrintcraftOptions } = { current: {} };
