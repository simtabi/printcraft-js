// `@simtabi/printcraft/share`
//
// Screenshots, clipboard and email. The compose window comes from the ui layer,
// so importing this brings that with it: the surfaces and the mechanics are one
// feature from a caller's point of view.

import { attachment } from './index';
import { attachUi } from './attach';
import { makeShareSurface } from './share/surface';
import { shareActions } from './share/actions';
import { contributeActions } from './ui/catalogue';

attachUi();
attachment.Printcraft.share = makeShareSurface(attachment);

// screenshot, copy and email become menu, palette and keyboard entries like
// everything else. contributed rather than imported by the catalogue, so a page
// that only loads /ui does not pull a rasteriser in behind it.
contributeActions(() => shareActions(attachment.Printcraft));

export * from './index';
export { default } from './index';
export * from './share';
export type { ShareSurface } from './share/surface';
