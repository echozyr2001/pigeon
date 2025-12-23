// Main library exports for ink-vim-mode

// Context and Provider
export { VimProvider, useVimContext } from "./context/VimProvider";

// React hooks
export {
  useVimMode,
  useVimNavigation,
  useVimInput,
  useVimCommand,
  useVimMotion,
  useStandardVimNavigation,
  useVimUnhandledInput,
  useVimModeAwareInput,
  useVimEditor,
  useVimEditorCommands,
} from "./hooks";

// Components
export { StatusLine } from "./components/StatusLine";

// Registry
export { PanelRegistry } from "./registry";

// Input Dispatcher
export { InputDispatcher } from "./dispatcher";

// Command System
export { VimCommandExecutor, defaultCommandExecutor } from "./commands";
export {
  CommandRegistry,
  globalCommandRegistry,
  useCommandRegistry,
  type CommandHandler
} from "./commands/registry";

// TypeScript types
export type {
  VimMode,
  VimCommand,
  SpatialRelationships,
  PanelRegistration,
  VimContextState,
  MotionCommand,
  NavigationCommand,
  ActionCommand,
  StatusLineState,
  StatusLineProps,
  Direction,
  VimModeContext,
  VimModeEvent,
  InputDispatcherConfig,
  VimNavigationHook,
  VimModeHook,
  VimInputHook,
  CommandResult,
  CommandExecutor,
  EditorOperations,
  WarningType,
  DevWarning,
  DevWarningConfig,
  UseVimEditorOptions,
  UseVimEditorReturn,
} from "./types";

// Type guards
export { isMotionCommand } from "./type-guards";

// Type guard utilities
export { isNavigationCommand, isActionCommand } from "./type-guards";

// Development utilities
export { DevWarningManager, devWarningManager } from "./utils";
