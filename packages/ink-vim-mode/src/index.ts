// Main library exports for ink-vim-mode

// Context and Provider
export { VimProvider, useVimContext } from "./context/VimProvider";

// React hooks
export { useVimMode, useVimNavigation, useVimInput } from "./hooks";

// Components
export { StatusLine } from "./components/StatusLine";

// Registry
export { PanelRegistry } from "./registry";

// Input Dispatcher
export { InputDispatcher } from "./dispatcher";

// Command System
export { VimCommandExecutor, defaultCommandExecutor } from "./commands";

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
  Direction,
  VimModeContext,
  VimModeEvent,
  InputDispatcherConfig,
  InputDispatcherDependencies,
  VimNavigationHook,
  VimModeHook,
  VimInputHook,
  CommandResult,
  CommandExecutor,
} from "./types";
