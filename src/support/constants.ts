// names and tag lists shared across the whole library.

/** the namespace used for every data attribute, css class prefix, and log label. */
export const NS = 'printcraft';

/** temporary attribute linking a measured live element to its clone. */
export const DATA_ID = 'data-pc-id';

/** tags that cannot be a print target — cloning one produces nothing printable. */
export const FORBIDDEN_TAGS = [
  'LINK',
  'TITLE',
  'HEAD',
  'META',
  'BASE',
  'BASEFONT',
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'APPLET',
  'IFRAME',
  'FRAME',
  'OBJECT',
  'EMBED'
];
