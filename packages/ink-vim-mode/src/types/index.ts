// Type definitions for ink-vim-mode library

export type VimMode = "NORMAL" | "INSERT" | "VISUAL" | "COMMAND";

export interface VimContextState {
  mode: VimMode;
  activePanelId: string | null;
  commandBuffer: string;
  panelRegistry: any; // Will be properly typed when PanelRegistry is implemented
  statusMessage: string | null;
}

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

export interface VimCommand {
  type: "MOTION" | "ACTION" | "MODE_CHANGE" | "NAVIGATION";
  command: string;
  count?: number;
  target?: string;
}

export interface MotionCommand extends VimCommand {
  type: "MOTION";
  direction: "h" | "j" | "k" | "l";
  count: number;
}

export interface NavigationCommand extends VimCommand {
  type: "NAVIGATION";
  direction: "h" | "j" | "k" | "l";
  targetPanel?: string;
}

export interface StatusLineState {
  mode: VimMode;
  commandBuffer: string;
  activePanelId: string | null;
  message: string | null;
  commandInput: string; // For COMMAND mode
}
