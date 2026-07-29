// Drawn annotations: pen, highlighter, arrows, boxes, circles and text.
//
// Shapes live in a `data-printcraft-drawing` attribute on the element they mark,
// exactly as notes and redactions do. That is what makes them survive between
// jobs, get listed in the notes panel, reach the notes page, and persist through
// the same session as everything else, with nothing here having to know about
// any of it.

export {
  DEFAULTS,
  DRAWING_VERSION,
  bounds,
  describeShape,
  isTwoPoint,
  parse,
  serialise,
  shapeId,
  simplify,
  toFraction,
  type Drawing,
  type Point,
  type Shape,
  type ShapeKind
} from './model';

export { inkData, mountOverlay, overlayNode, pathData, unmountOverlay } from './render';

export {
  chooseImage,
  imageFrom,
  placeAt,
  prepareImage,
  MAX_BYTES,
  MAX_EDGE,
  type PreparedImage
} from './image';

export {
  clearDrawings,
  drawingOn,
  drawings,
  openStudio,
  repaintAll,
  setDrawing,
  type StudioHandle,
  type StudioOptions
} from './studio';
