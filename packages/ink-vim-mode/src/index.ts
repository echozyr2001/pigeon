// Main library exports for ink-vim-mode

// Context and Provider
export { VimProvider } from "./context/VimProvider";

// React hooks
export { useVimMode, useVimNavigation, useVimInput } from "./hooks";

// Components
export { StatusLine } from "./components/StatusLine";

// TypeScript types
export type {
  VimMode,
  VimCommand,
  SpatialRelationships,
  PanelRegistration,
  VimContextState,
  MotionCommand,
  NavigationCommand,
  StatusLineState,
} from "./types";
