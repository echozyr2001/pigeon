// Automatic mode transition handler for standard Vim keybindings
// Handles Escape, i, a, o, O, :, v, V, and other standard mode transitions

import type { VimMode } from "../types";

export interface ModeTransitionResult {
  shouldTransition: boolean;
  targetMode?: VimMode;
  handled: boolean;
  requiresSpecialHandling?: boolean;
  specialAction?: string;
}

export interface ModeTransitionContext {
  currentMode: VimMode;
  input: string;
  key: any;
  commandBuffer: string;
  activePanelId: string | null;
}

/**
 * Enhanced mode transition handler that recognizes standard Vim keybindings
 * and automatically handles mode transitions
 */
export class ModeTransitionHandler {
  /**
   * Check if input should trigger a mode transition and return the result
   */
  public static handleModeTransition(
    context: ModeTransitionContext
  ): ModeTransitionResult {
    const { currentMode, input, key } = context;

    switch (currentMode) {
      case "NORMAL":
        return this.handleNormalModeTransitions(context);
      case "INSERT":
        return this.handleInsertModeTransitions(context);
      case "VISUAL":
        return this.handleVisualModeTransitions(context);
      case "COMMAND":
        return this.handleCommandModeTransitions(context);
      default:
        return { shouldTransition: false, handled: false };
    }
  }

  /**
   * Handle mode transitions from NORMAL mode
   */
  private static handleNormalModeTransitions(
    context: ModeTransitionContext
  ): ModeTransitionResult {
    const { input, key } = context;

    // Escape in NORMAL mode - clear command buffer but stay in NORMAL
    if (key.escape) {
      return {
        shouldTransition: false,
        handled: true,
        requiresSpecialHandling: true,
        specialAction: "CLEAR_BUFFER",
      };
    }

    // Insert mode transitions
    if (input === "i") {
      return {
        shouldTransition: true,
        targetMode: "INSERT",
        handled: true,
      };
    }

    if (input === "a") {
      return {
        shouldTransition: true,
        targetMode: "INSERT",
        handled: true,
        requiresSpecialHandling: true,
        specialAction: "APPEND_MODE",
      };
    }

    if (input === "o") {
      return {
        shouldTransition: true,
        targetMode: "INSERT",
        handled: true,
        requiresSpecialHandling: true,
        specialAction: "OPEN_LINE_BELOW",
      };
    }

    if (input === "O") {
      return {
        shouldTransition: true,
        targetMode: "INSERT",
        handled: true,
        requiresSpecialHandling: true,
        specialAction: "OPEN_LINE_ABOVE",
      };
    }

    if (input === "A") {
      return {
        shouldTransition: true,
        targetMode: "INSERT",
        handled: true,
        requiresSpecialHandling: true,
        specialAction: "APPEND_END_OF_LINE",
      };
    }

    if (input === "I") {
      return {
        shouldTransition: true,
        targetMode: "INSERT",
        handled: true,
        requiresSpecialHandling: true,
        specialAction: "INSERT_BEGINNING_OF_LINE",
      };
    }

    // Visual mode transitions
    if (input === "v") {
      return {
        shouldTransition: true,
        targetMode: "VISUAL",
        handled: true,
      };
    }

    if (input === "V") {
      return {
        shouldTransition: true,
        targetMode: "VISUAL",
        handled: true,
        requiresSpecialHandling: true,
        specialAction: "VISUAL_LINE_MODE",
      };
    }

    // Command mode transition
    if (input === ":") {
      return {
        shouldTransition: true,
        targetMode: "COMMAND",
        handled: true,
      };
    }

    // Search mode (treated as COMMAND mode for now)
    if (input === "/") {
      return {
        shouldTransition: true,
        targetMode: "COMMAND",
        handled: true,
        requiresSpecialHandling: true,
        specialAction: "SEARCH_FORWARD",
      };
    }

    if (input === "?") {
      return {
        shouldTransition: true,
        targetMode: "COMMAND",
        handled: true,
        requiresSpecialHandling: true,
        specialAction: "SEARCH_BACKWARD",
      };
    }

    return { shouldTransition: false, handled: false };
  }

  /**
   * Handle mode transitions from INSERT mode
   */
  private static handleInsertModeTransitions(
    context: ModeTransitionContext
  ): ModeTransitionResult {
    const { key } = context;

    // Escape - return to NORMAL mode
    if (key.escape) {
      return {
        shouldTransition: true,
        targetMode: "NORMAL",
        handled: true,
      };
    }

    // Ctrl+C - alternative escape (common Vim behavior)
    if (key.ctrl && context.input === "c") {
      return {
        shouldTransition: true,
        targetMode: "NORMAL",
        handled: true,
      };
    }

    // Ctrl+[ - another alternative escape
    if (key.ctrl && context.input === "[") {
      return {
        shouldTransition: true,
        targetMode: "NORMAL",
        handled: true,
      };
    }

    return { shouldTransition: false, handled: false };
  }

  /**
   * Handle mode transitions from VISUAL mode
   */
  private static handleVisualModeTransitions(
    context: ModeTransitionContext
  ): ModeTransitionResult {
    const { input, key } = context;

    // Escape - return to NORMAL mode
    if (key.escape) {
      return {
        shouldTransition: true,
        targetMode: "NORMAL",
        handled: true,
      };
    }

    // Insert mode transitions from VISUAL
    if (input === "i" || input === "a") {
      return {
        shouldTransition: true,
        targetMode: "INSERT",
        handled: true,
      };
    }

    // Command mode from VISUAL (for visual commands like :s)
    if (input === ":") {
      return {
        shouldTransition: true,
        targetMode: "COMMAND",
        handled: true,
        requiresSpecialHandling: true,
        specialAction: "VISUAL_COMMAND",
      };
    }

    // Switch to different visual modes
    if (input === "v") {
      // Already in visual mode, this could toggle back to NORMAL
      return {
        shouldTransition: true,
        targetMode: "NORMAL",
        handled: true,
      };
    }

    if (input === "V") {
      return {
        shouldTransition: false, // Stay in VISUAL but change to line mode
        handled: true,
        requiresSpecialHandling: true,
        specialAction: "VISUAL_LINE_MODE",
      };
    }

    return { shouldTransition: false, handled: false };
  }

  /**
   * Handle mode transitions from COMMAND mode
   */
  private static handleCommandModeTransitions(
    context: ModeTransitionContext
  ): ModeTransitionResult {
    const { key } = context;

    // Escape - return to NORMAL mode
    if (key.escape) {
      return {
        shouldTransition: true,
        targetMode: "NORMAL",
        handled: true,
        requiresSpecialHandling: true,
        specialAction: "CANCEL_COMMAND",
      };
    }

    // Enter - execute command and return to NORMAL mode
    if (key.return) {
      return {
        shouldTransition: true,
        targetMode: "NORMAL",
        handled: true,
        requiresSpecialHandling: true,
        specialAction: "EXECUTE_COMMAND",
      };
    }

    // Ctrl+C - cancel command
    if (key.ctrl && context.input === "c") {
      return {
        shouldTransition: true,
        targetMode: "NORMAL",
        handled: true,
        requiresSpecialHandling: true,
        specialAction: "CANCEL_COMMAND",
      };
    }

    return { shouldTransition: false, handled: false };
  }

  /**
   * Get a human-readable description of the mode transition
   */
  public static getTransitionDescription(
    fromMode: VimMode,
    toMode: VimMode,
    specialAction?: string
  ): string {
    if (specialAction) {
      switch (specialAction) {
        case "APPEND_MODE":
          return "Enter INSERT mode after cursor";
        case "OPEN_LINE_BELOW":
          return "Open new line below and enter INSERT mode";
        case "OPEN_LINE_ABOVE":
          return "Open new line above and enter INSERT mode";
        case "APPEND_END_OF_LINE":
          return "Move to end of line and enter INSERT mode";
        case "INSERT_BEGINNING_OF_LINE":
          return "Move to beginning of line and enter INSERT mode";
        case "VISUAL_LINE_MODE":
          return "Enter VISUAL line selection mode";
        case "SEARCH_FORWARD":
          return "Enter forward search mode";
        case "SEARCH_BACKWARD":
          return "Enter backward search mode";
        case "VISUAL_COMMAND":
          return "Enter COMMAND mode with visual selection";
        case "CANCEL_COMMAND":
          return "Cancel command and return to NORMAL mode";
        case "EXECUTE_COMMAND":
          return "Execute command and return to NORMAL mode";
        case "CLEAR_BUFFER":
          return "Clear command buffer";
        default:
          return `${fromMode} -> ${toMode} (${specialAction})`;
      }
    }

    return `${fromMode} -> ${toMode}`;
  }

  /**
   * Check if a key combination is a standard Vim mode transition
   */
  public static isStandardModeTransition(
    input: string,
    key: any,
    currentMode: VimMode
  ): boolean {
    const context: ModeTransitionContext = {
      currentMode,
      input,
      key,
      commandBuffer: "",
      activePanelId: null,
    };

    const result = this.handleModeTransition(context);
    return result.shouldTransition || result.handled;
  }

  /**
   * Get all possible mode transitions from a given mode
   */
  public static getPossibleTransitions(fromMode: VimMode): Array<{
    key: string;
    targetMode: VimMode;
    description: string;
  }> {
    switch (fromMode) {
      case "NORMAL":
        return [
          {
            key: "i",
            targetMode: "INSERT",
            description: "Insert before cursor",
          },
          {
            key: "a",
            targetMode: "INSERT",
            description: "Insert after cursor",
          },
          { key: "o", targetMode: "INSERT", description: "Open line below" },
          { key: "O", targetMode: "INSERT", description: "Open line above" },
          {
            key: "A",
            targetMode: "INSERT",
            description: "Append at end of line",
          },
          {
            key: "I",
            targetMode: "INSERT",
            description: "Insert at beginning of line",
          },
          { key: "v", targetMode: "VISUAL", description: "Visual selection" },
          {
            key: "V",
            targetMode: "VISUAL",
            description: "Visual line selection",
          },
          { key: ":", targetMode: "COMMAND", description: "Command mode" },
          { key: "/", targetMode: "COMMAND", description: "Search forward" },
          { key: "?", targetMode: "COMMAND", description: "Search backward" },
        ];
      case "INSERT":
        return [
          {
            key: "Escape",
            targetMode: "NORMAL",
            description: "Return to normal mode",
          },
          {
            key: "Ctrl+C",
            targetMode: "NORMAL",
            description: "Return to normal mode",
          },
          {
            key: "Ctrl+[",
            targetMode: "NORMAL",
            description: "Return to normal mode",
          },
        ];
      case "VISUAL":
        return [
          {
            key: "Escape",
            targetMode: "NORMAL",
            description: "Return to normal mode",
          },
          { key: "i", targetMode: "INSERT", description: "Insert mode" },
          { key: "a", targetMode: "INSERT", description: "Insert mode" },
          {
            key: ":",
            targetMode: "COMMAND",
            description: "Visual command mode",
          },
          { key: "v", targetMode: "NORMAL", description: "Exit visual mode" },
        ];
      case "COMMAND":
        return [
          {
            key: "Escape",
            targetMode: "NORMAL",
            description: "Cancel command",
          },
          {
            key: "Enter",
            targetMode: "NORMAL",
            description: "Execute command",
          },
          {
            key: "Ctrl+C",
            targetMode: "NORMAL",
            description: "Cancel command",
          },
        ];
      default:
        return [];
    }
  }
}
