// The component kit: every surface the library draws, from a spec.

export { modal, promptFor, type ModalSpec, type ModalAction, type ModalResult } from './modal';
export { confirm, notify, type ConfirmSpec } from './confirm';
export { openMenu, type MenuSpec, type MenuItem, type MenuEntry, type MenuHandle } from './menu';
export { openToolbar, type ToolbarSpec, type ToolbarAction, type ToolbarHandle } from './toolbar';
export { toast, type ToastSpec, type ToastHandle } from './toast';
export { buildForm, type Field, type FieldValue, type FormHandle } from './form';
export { setTheme, getTheme, ensureStyles, DEFAULT_THEME, type Theme } from './theme';
export { Surface, openSurfaceCount, type SurfaceOptions } from './surface';
export { place, applyPlacement, type Anchor, type Placement } from './position';
export { h, root, button, iconNode, focusable } from './dom';
