// Type definitions for ink-vim-mode library

export type VimMode = "NORMAL" | "INSERT" | "VISUAL" | "COMMAND";

export type Direction = "h" | "j" | "k" | "l";

// Core Context Interface
export interface VimContextState {
  mode: VimMode;
  activePanelId: string | null;
  commandBuffer: string;
  panelRegistry: PanelRegistry;
  count: number;
  statusMessage: string | null;
  commandInput: string;
}

// Forward declaration for InputDispatcher (to avoid circular imports)
export interface InputDispatcherInterface {
  registerComponentHandler(
    panelId: string,
    handler: (command: VimCommand) => void
  ): void;
  unregisterComponentHandler(panelId: string): void;
  process(input: string, key: any): boolean;
}

// Extended context interface for internal use (includes methods for hooks)
export interface VimContextExtended extends VimContextState {
  send: (event: VimModeEvent) => void;
  inputDispatcher: InputDispatcherInterface;
  setActivePanelId: (panelId: string | null) => void;
}

// Panel Registration Types
export interface PanelRegistration {
  id: string;
  relationships: SpatialRelationships;
  inputHandler?: (command: VimCommand) => void;
}

export interface SpatialRelationships {
  left?: string;
  right?: string;
  up?: string;
  down?: string;
}

// Command Types
export interface VimCommand {
  type: "MOTION" | "ACTION" | "MODE_CHANGE" | "NAVIGATION";
  command: string;
  count?: number;
  target?: string;
}

export interface MotionCommand extends VimCommand {
  type: "MOTION";
  direction: Direction;
  count: number;
}

export interface NavigationCommand extends VimCommand {
  type: "NAVIGATION";
  direction: Direction;
  targetPanel?: string;
}

export interface ActionCommand extends VimCommand {
  type: "ACTION";
  command: "DELETE_CHAR" | "DELETE_LINE" | "YANK" | "PASTE";
  count?: number;
}

// XState Machine Types
export interface VimModeContext {
  previousMode: VimMode;
  commandBuffer: string;
  count: number;
  statusMessage: string | null;
  commandInput: string; // For COMMAND mode text input
}

export type VimModeEvent =
  | { type: "ENTER_INSERT" }
  | { type: "ENTER_VISUAL" }
  | { type: "ENTER_COMMAND" }
  | { type: "ESCAPE" }
  | { type: "APPEND_BUFFER"; char: string }
  | { type: "CLEAR_BUFFER" }
  | { type: "EXECUTE_COMMAND"; command: string }
  | { type: "FOCUS_PANEL"; panelId: string }
  | { type: "UPDATE_COMMAND_INPUT"; input: string };

// Input Dispatcher Types
export interface InputDispatcherConfig {
  globalHandlers: Record<string, () => void>;
  modeHandlers: Record<VimMode, (input: string, key: any) => boolean>;
  componentHandlers: Map<string, (command: VimCommand) => void>;
}

// Panel Registry Interface
export interface PanelRegistry {
  register(id: string, relationships: SpatialRelationships): void;
  unregister(id: string): void;
  findAdjacent(panelId: string, direction: Direction): string | null;
  validateConnectivity(): boolean;
}

// Status Line Types
export interface StatusLineState {
  mode: VimMode;
  commandBuffer: string;
  activePanelId: string | null;
  message: string | null;
  commandInput: string; // For COMMAND mode
}

// Hook Return Types
export interface VimNavigationHook {
  register: (id: string, relationships: SpatialRelationships) => void;
  unregister: (id: string) => void;
  focus: (panelId: string) => void;
}

export interface VimModeHook {
  mode: VimMode;
  send: (event: VimModeEvent) => void;
  commandBuffer: string;
  statusMessage: string | null;
  commandInput: string;
}

export interface VimInputHook {
  isActive: boolean;
  mode: VimMode;
  unregister: () => void;  // Added for manual cleanup
}

// Editor operations interface
export interface EditorOperations {
  onInsertChar: (char: string) => void;
  onDeleteChar: () => void;
  onDeleteLine: () => void;
  onInsertNewline: () => void;
  onBackspace: () => void;
}

// Command System Types
export interface CommandResult {
  success: boolean;
  message?: string;
  error?: string;
}

export interface CommandExecutor {
  execute(command: string): CommandResult;
  registerCommand(
    name: string,
    handler: (args: string[]) => CommandResult
  ): void;
  unregisterCommand(name: string): void;
  getAvailableCommands(): string[];
}
