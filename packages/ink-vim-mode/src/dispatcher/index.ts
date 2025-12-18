// Input dispatching system for routing keyboard events

import type {
  VimCommand,
  VimMode,
  Direction,
  MotionCommand,
  PanelRegistry,
} from "../types";
import { parseKeyToCommand } from "./parser";

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
   */
  private handleGlobalInput(input: string, key: any): boolean {
    // Handle Ctrl+hjkl for spatial navigation with highest priority
    if (key.ctrl) {
      const direction = this.getDirectionFromInput(input);
      if (direction) {
        return this.handleSpatialNavigation(direction);
      }
    }

    return false;
  }

  /**
   * Tier 2: Handle mode-specific input
   */
  private handleModeInput(input: string, key: any): boolean {
    const currentMode = this.dependencies.getCurrentMode();

    switch (currentMode) {
      case "NORMAL":
        return this.handleNormalModeInput(input, key);
      case "INSERT":
        return this.handleInsertModeInput(input, key);
      case "VISUAL":
        return this.handleVisualModeInput(input, key);
      case "COMMAND":
        return this.handleCommandModeInput(input, key);
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
   * Handle NORMAL mode input
   */
  private handleNormalModeInput(input: string, key: any): boolean {
    // Handle Escape key
    if (key.escape) {
      this.dependencies.sendModeEvent({ type: "ESCAPE" });
      return true;
    }

    // Handle mode transitions
    if (input === "i" || input === "a") {
      this.dependencies.sendModeEvent({ type: "ENTER_INSERT" });
      return true;
    }

    if (input === ":") {
      this.dependencies.sendModeEvent({ type: "ENTER_COMMAND" });
      return true;
    }

    if (input === "v") {
      this.dependencies.sendModeEvent({ type: "ENTER_VISUAL" });
      return true;
    }

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
   * Handle INSERT mode input - mostly pass through
   */
  private handleInsertModeInput(input: string, key: any): boolean {
    // Only handle Escape in INSERT mode
    if (key.escape) {
      this.dependencies.sendModeEvent({ type: "ESCAPE" });
      return true;
    }

    // All other input should be passed through to the component
    return false;
  }

  /**
   * Handle VISUAL mode input
   */
  private handleVisualModeInput(input: string, key: any): boolean {
    // Handle Escape key
    if (key.escape) {
      this.dependencies.sendModeEvent({ type: "ESCAPE" });
      return true;
    }

    // Handle mode transitions
    if (input === "i" || input === "a") {
      this.dependencies.sendModeEvent({ type: "ENTER_INSERT" });
      return true;
    }

    if (input === ":") {
      this.dependencies.sendModeEvent({ type: "ENTER_COMMAND" });
      return true;
    }

    // VISUAL-specific motions are expressed as VimCommand objects through
    // the parser and handled by component-level handlers.
    return false;
  }

  /**
   * Handle COMMAND mode input
   */
  private handleCommandModeInput(input: string, key: any): boolean {
    // Handle Escape key
    if (key.escape) {
      this.dependencies.sendModeEvent({ type: "ESCAPE" });
      return true;
    }

    // Handle Enter key to execute command
    if (key.return) {
      // For now, just return to NORMAL mode
      // Command execution will be implemented in a later task
      this.dependencies.sendModeEvent({ type: "EXECUTE_COMMAND", command: "" });
      return true;
    }

    // All other input in COMMAND mode should be handled by the status line component
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
