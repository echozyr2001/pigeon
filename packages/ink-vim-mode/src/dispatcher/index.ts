// Input dispatching system for routing keyboard events

import type {
  VimCommand,
  VimMode,
  Direction,
  MotionCommand,
  PanelRegistry,
} from "../types";
import { parseKeyToCommand } from "./parser";
import { ModeTransitionHandler } from "../utils/ModeTransitionHandler";
import { vimErrorHandler } from "../utils/ErrorHandler";

export interface InputDispatcherDependencies {
  getCurrentMode: () => VimMode;
  getActivePanelId: () => string | null;
  getCommandBuffer: () => string;
  getPanelRegistry: () => PanelRegistry;
  getCount: () => number;
  sendModeEvent: (event: any) => void;
  focusPanel: (panelId: string) => void;
}

export class InputDispatcher {
  private dependencies: InputDispatcherDependencies;
  private componentHandlers: Map<string, Set<(command: VimCommand) => void>> =
    new Map();
  private isDestroyed = false;
  private pendingOperator: string | null = null;

  constructor(dependencies: InputDispatcherDependencies) {
    this.dependencies = dependencies;
  }

  /**
   * Clean up resources and prevent memory leaks
   */
  destroy(): void {
    this.isDestroyed = true;
    this.componentHandlers.clear();
  }

  /**
   * Register a component-level input handler for a specific panel
   */
  registerComponentHandler(
    panelId: string,
    handler: (command: VimCommand) => void
  ): void {
    if (this.isDestroyed) {
      console.warn(
        "Attempted to register handler on destroyed InputDispatcher"
      );
      return;
    }
    const existing = this.componentHandlers.get(panelId);
    if (existing) {
      existing.add(handler);
    } else {
      this.componentHandlers.set(panelId, new Set([handler]));
    }
  }

  /**
   * Unregister a component-level input handler
   */
  unregisterComponentHandler(panelId: string): void {
    if (this.isDestroyed) {
      return;
    }
    const existing = this.componentHandlers.get(panelId);
    if (!existing) {
      return;
    }
    existing.clear();
    this.componentHandlers.delete(panelId);
  }

  /**
   * Process input through the three-tier hierarchy
   * Returns true if input was handled, false if it should be passed through
   */
  process(input: string, key: any): boolean {
    if (this.isDestroyed) {
      return false;
    }

    // Skip empty inputs that are not actual key presses
    // These are often internal Ink events or terminal artifacts
    if (input === "" && !key.ctrl && !key.escape && !key.return && !key.backspace && !key.delete) {
      return false;
    }

    const currentMode = this.dependencies.getCurrentMode();

    // Tier 1: Global handlers (highest priority)
    // Handle Ctrl+hjkl for spatial navigation
    if (this.handleGlobalInput(input, key)) {
      return true;
    }

    // Tier 2: Mode-specific handlers
    if (this.handleModeInput(input, key)) {
      return true;
    }

    // Tier 3: Component-level handlers
    // Skip component-level handlers in INSERT mode - all input should be passed through
    // as text input (except Escape which is handled in Tier 2)
    if (currentMode !== "INSERT") {
      if (this.handleComponentInput(input, key)) {
        return true;
      }
    }

    // If no handler processed the input, it should be passed through
    // This is especially important for INSERT mode
    return false;
  }

  /**
   * Tier 1: Handle global input (Ctrl+hjkl spatial navigation)
   * Also handles backspace/delete as Ctrl+h equivalents (terminal compatibility)
   */
  private handleGlobalInput(input: string, key: any): boolean {
    // Handle Ctrl+hjkl for spatial navigation
    if (key.ctrl) {
      const direction = this.getDirectionFromInput(input);
      if (direction) {
        return this.handleSpatialNavigation(direction);
      }
    }

    // Terminal compatibility: Some terminals send backspace/delete for Ctrl+h
    // Treat backspace as "left" navigation when no input is provided
    if ((key.backspace || key.delete) && input === "") {
      // Check if we're in NORMAL mode and not in COMMAND mode
      const currentMode = this.dependencies.getCurrentMode();
      if (currentMode === "NORMAL") {
        return this.handleSpatialNavigation("h"); // Treat as left
      }
    }

    return false;
  }

  /**
   * Tier 2: Handle mode-specific input with automatic mode transitions
   */
  private handleModeInput(input: string, key: any): boolean {
    const currentMode = this.dependencies.getCurrentMode();
    const activePanelId = this.dependencies.getActivePanelId();
    const commandBuffer = this.dependencies.getCommandBuffer();

    // Check for automatic mode transitions first
    const transitionContext = {
      currentMode,
      input,
      key,
      commandBuffer,
      activePanelId,
    };

    try {
      const transitionResult =
        ModeTransitionHandler.handleModeTransition(transitionContext);

      if (transitionResult.shouldTransition && transitionResult.targetMode) {
        // Handle the mode transition
        this.handleModeTransition(
          currentMode,
          transitionResult.targetMode,
          transitionResult.specialAction
        );
        return true;
      }

      if (
        transitionResult.handled &&
        transitionResult.requiresSpecialHandling
      ) {
        // Handle special actions without mode transition
        this.handleSpecialAction(transitionResult.specialAction);
        return true;
      }

      if (transitionResult.handled) {
        return true;
      }
    } catch (error) {
      vimErrorHandler.handleInputProcessingError(
        currentMode,
        input,
        activePanelId || undefined,
        error instanceof Error ? error : new Error(String(error))
      );
      // Continue with fallback handling
    }

    // Fallback to original mode-specific handling
    switch (currentMode) {
      case "NORMAL":
        return this.handleNormalModeInputFallback(input, key);
      case "INSERT":
        return this.handleInsertModeInputFallback(input, key);
      case "VISUAL":
        return this.handleVisualModeInputFallback(input, key);
      case "COMMAND":
        return this.handleCommandModeInputFallback(input, key);
      default:
        return false;
    }
  }

  /**
   * Tier 3: Handle component-level input
   */
  private handleComponentInput(input: string, key: any): boolean {
    const currentMode = this.dependencies.getCurrentMode();

    // Skip component-level handlers in INSERT and COMMAND modes
    // In INSERT mode, all input should be passed through as text
    // In COMMAND mode, input is handled by StatusLine component
    if (currentMode === "INSERT" || currentMode === "COMMAND") {
      return false;
    }

    const activePanelId = this.dependencies.getActivePanelId();
    if (!activePanelId) {
      return false;
    }

    const handlers = this.componentHandlers.get(activePanelId);
    if (!handlers || handlers.size === 0) {
      return false;
    }

    // Use the pure key -> command parser to turn the current key plus
    // mode/count/pendingOperator into a high-level VimCommand.
    const result = parseKeyToCommand(input, currentMode, {
      count: this.dependencies.getCount(),
      pendingOperator: this.pendingOperator,
    });

    this.pendingOperator = result.nextPendingOperator;

    if (result.clearCountBuffer) {
      this.dependencies.sendModeEvent({ type: "CLEAR_BUFFER" });
    }

    if (result.command) {
      for (const handler of handlers) {
        handler(result.command);
      }
      return true;
    }

    return false;
  }

  /**
   * Handle mode transition with proper event dispatching
   */
  private handleModeTransition(
    fromMode: VimMode,
    toMode: VimMode,
    specialAction?: string
  ): void {
    try {
      // Send appropriate mode transition event
      switch (toMode) {
        case "INSERT":
          this.dependencies.sendModeEvent({ type: "ENTER_INSERT" });
          break;
        case "NORMAL":
          this.dependencies.sendModeEvent({ type: "ESCAPE" });
          break;
        case "VISUAL":
          this.dependencies.sendModeEvent({ type: "ENTER_VISUAL" });
          break;
        case "COMMAND":
          this.dependencies.sendModeEvent({ type: "ENTER_COMMAND" });
          break;
      }

      // Handle special actions that accompany mode transitions
      if (specialAction) {
        this.handleSpecialAction(specialAction);
      }
    } catch (error) {
      vimErrorHandler.createError("INPUT_PROCESSING_FAILED", {
        originalError:
          error instanceof Error ? error : new Error(String(error)),
        customMessage: `Failed to transition from ${fromMode} to ${toMode}`,
        customSuggestion:
          "Check that mode transition handlers are properly configured and don't throw exceptions.",
        location: `Mode transition: ${fromMode} -> ${toMode}`,
      });
    }
  }

  /**
   * Handle special actions that don't involve mode transitions
   */
  private handleSpecialAction(action?: string): void {
    if (!action) return;

    try {
      switch (action) {
        case "CLEAR_BUFFER":
          this.dependencies.sendModeEvent({ type: "CLEAR_BUFFER" });
          break;
        case "CANCEL_COMMAND":
          this.dependencies.sendModeEvent({ type: "ESCAPE" });
          break;
        case "EXECUTE_COMMAND":
          // Get current command input and execute it
          this.dependencies.sendModeEvent({
            type: "EXECUTE_COMMAND",
            command: "", // Command will be handled by the state machine
          });
          break;
        // Special insert mode actions could be handled here in the future
        case "APPEND_MODE":
        case "OPEN_LINE_BELOW":
        case "OPEN_LINE_ABOVE":
        case "APPEND_END_OF_LINE":
        case "INSERT_BEGINNING_OF_LINE":
        case "VISUAL_LINE_MODE":
        case "SEARCH_FORWARD":
        case "SEARCH_BACKWARD":
        case "VISUAL_COMMAND":
          // These actions are handled by the components themselves
          // The mode transition is sufficient for now
          break;
        default:
          console.warn(`Unknown special action: ${action}`);
      }
    } catch (error) {
      vimErrorHandler.createError("INPUT_PROCESSING_FAILED", {
        originalError:
          error instanceof Error ? error : new Error(String(error)),
        customMessage: `Failed to handle special action: ${action}`,
        customSuggestion:
          "Check that special action handlers are properly implemented.",
        location: `Special action handler: ${action}`,
      });
    }
  }
  /**
   * Handle NORMAL mode input (fallback for non-standard transitions)
   */
  /**
   * Handle NORMAL mode input (fallback for non-standard transitions)
   */
  private handleNormalModeInputFallback(input: string, key: any): boolean {
    // Handle numeric prefixes (digits). We only mutate the state machine's
    // commandBuffer/count here; translation into concrete VimCommand
    // objects is delegated to the pure parser.
    if (/^\d$/.test(input)) {
      this.dependencies.sendModeEvent({ type: "APPEND_BUFFER", char: input });
      return true;
    }

    // All other NORMAL mode keys fall through to component-level handling.
    return false;
  }

  /**
   * Handle INSERT mode input (fallback for non-standard transitions)
   */
  /**
   * Handle INSERT mode input (fallback for non-standard transitions)
   */
  private handleInsertModeInputFallback(input: string, key: any): boolean {
    // All input in INSERT mode should be passed through to the component
    // Mode transitions are handled by the automatic mode transition handler
    return false;
  }

  /**
   * Handle VISUAL mode input (fallback for non-standard transitions)
   */
  /**
   * Handle VISUAL mode input (fallback for non-standard transitions)
   */
  private handleVisualModeInputFallback(input: string, key: any): boolean {
    // VISUAL-specific motions are expressed as VimCommand objects through
    // the parser and handled by component-level handlers.
    // Mode transitions are handled by the automatic mode transition handler
    return false;
  }

  /**
   * Handle COMMAND mode input (fallback for non-standard transitions)
   */
  /**
   * Handle COMMAND mode input (fallback for non-standard transitions)
   */
  private handleCommandModeInputFallback(input: string, key: any): boolean {
    // All input in COMMAND mode should be handled by the status line component
    // Mode transitions are handled by the automatic mode transition handler
    return false;
  }

  /**
   * Handle spatial navigation between panels (Ctrl+hjkl)
   */
  private handleSpatialNavigation(direction: Direction): boolean {
    const activePanelId = this.dependencies.getActivePanelId();
    if (!activePanelId) {
      return false;
    }

    const panelRegistry = this.dependencies.getPanelRegistry();
    const targetPanelId = panelRegistry.findAdjacent(activePanelId, direction);

    if (targetPanelId) {
      this.dependencies.focusPanel(targetPanelId);
      return true;
    }

    // No adjacent panel found, but we still handled the input
    return true;
  }

  /**
   * Convert input character to direction
   */
  private getDirectionFromInput(input: string): Direction | null {
    switch (input) {
      case "h":
        return "h";
      case "j":
        return "j";
      case "k":
        return "k";
      case "l":
        return "l";
      default:
        return null;
    }
  }
}
