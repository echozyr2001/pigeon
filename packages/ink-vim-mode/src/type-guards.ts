// Type guards for Vim commands

import type { VimCommand, MotionCommand, NavigationCommand, ActionCommand } from "./types";

/**
 * Type guard for MotionCommand
 */
export function isMotionCommand(command: VimCommand): command is MotionCommand {
  return command.type === "MOTION" && "direction" in command;
}

/**
 * Type guard for NavigationCommand
 */
export function isNavigationCommand(command: VimCommand): command is NavigationCommand {
  return command.type === "NAVIGATION" && "direction" in command;
}

/**
 * Type guard for ActionCommand
 */
export function isActionCommand(command: VimCommand): command is ActionCommand {
  return command.type === "ACTION" && "command" in command;
}
