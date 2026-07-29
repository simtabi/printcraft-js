// Everything, in one bundle: what the script tag loads.
//
// A page with no bundler cannot split anything, so splitting it there would cost
// three requests and buy nothing.
//
// Only the default is exported at runtime. A umd build assigns whatever the
// entry's namespace is to the global, so re-exporting the named members too
// would make `window.Printcraft` an object holding the class rather than the
// class itself.

import Printcraft from './index';
import './entry-ui';
import './entry-share';

export default Printcraft;
