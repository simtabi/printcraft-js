// Getting the print copy out of the page: as an image, on the clipboard, or in
// an email.
//
// Everything here starts from the transformed clone rather than the live page.
// That is the whole design: a screenshot of what is on screen would put back
// every value redaction was asked to destroy, so a redacted document has to
// stay redacted in the png, in the clipboard payload and in the attachment.

export { rasterize, blobToDataUrl } from './rasterize';
export type { RasterizeOptions, Raster } from './rasterize';

export { screenshot, saveBlob } from './screenshot';
export type { ScreenshotOptions, Screenshot } from './screenshot';

export { copyImage, copyHtml, copyText } from './clipboard';
export type { CopyFormat, CopyResult } from './clipboard';

export { sendEmail, mailtoUrl, parseAddresses, invalidAddresses } from './email';
export type {
  EmailAttachment,
  EmailMessage,
  EmailResult,
  EmailTransport,
  SendOptions
} from './email';
