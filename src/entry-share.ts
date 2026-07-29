// `@simtabi/printcraft/share`
//
// Screenshots, clipboard and email. The compose window comes from the ui layer,
// so importing this brings that with it: the surfaces and the mechanics are one
// feature from a caller's point of view.

import { attachment } from './index';
import { attachUi } from './attach';
import { makeShareSurface } from './share/surface';

attachUi();
attachment.Printcraft.share = makeShareSurface(attachment);

export * from './index';
export { default } from './index';
export * from './share';
export type { ShareSurface } from './share/surface';
