// Input dispatching system for routing keyboard events

import type {
  VimCommand,
  VimMode,
  Direction,
  MotionCommand,
  NavigationCommand,
  PanelRegistry,
} from "../types";

export interface InputDispatcherDependencies {
  getCurrentMode: () => VimMode;
  getActivePanelId: () => string | null;
  getCommandBuffer: () => string;
  getPanelRegistry: () => PanelRegistry;
  sendModeEvent: (event: any) => void;
  focusPanel: (panelId: string) => void;
}

export class InputDispatcher {
  private dependencies: InputDispatcherDependencies;
  private componentHandlers: Map<string, (command: VimCommand) => void> =
    new Map();

  constructor(dependencies: InputDispatcherDependencies) {
    this.dependencies = dependencies;
  }

  /**
   * Register a component-level input handler for a specific panel
   */
  registerComponentHandler(
    panelId: string,
    handler: (command: VimCommand) => void
  ): void {
    this.componentHandlers.set(panelId, handler);
  }

  /**
   * Unregister a component-level input handler
   */
  unregisterComponentHandler(panelId: string): void {
    this.componentHandlers.delete(panelId);
  }

  /**
   * Process input through the three-tier hierarchy
   * Returns true if input was handled, false if it should be passed through
   */
  process(input: string, key: any): boolean {
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
    if (this.handleComponentInput(input, key)) {
      return true;
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
    const activePanelId = this.dependencies.getActivePanelId();
    if (!activePanelId) {
      return false;
    }

    const handler = this.componentHandlers.get(activePanelId);
    if (!handler) {
      return false;
    }

    // Create appropriate command based on input
    const command = this.createCommandFromInput(input, key);
    if (command) {
      handler(command);
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

    // Handle numeric prefixes (digits)
    if (/^\d$/.test(input)) {
      this.dependencies.sendModeEvent({ type: "APPEND_BUFFER", char: input });
      return true;
    }

    // Handle hjkl navigation within panels (not spatial navigation)
    const direction = this.getDirectionFromInput(input);
    if (direction) {
      return this.handlePanelNavigation(direction);
    }

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

    // Handle hjkl navigation within panels
    const direction = this.getDirectionFromInput(input);
    if (direction) {
      return this.handlePanelNavigation(direction);
    }

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
   * Handle navigation within the current panel (hjkl in NORMAL/VISUAL mode)
   */
  private handlePanelNavigation(direction: Direction): boolean {
    const activePanelId = this.dependencies.getActivePanelId();
    if (!activePanelId) {
      return false;
    }

    const handler = this.componentHandlers.get(activePanelId);
    if (!handler) {
      return false;
    }

    const commandBuffer = this.dependencies.getCommandBuffer();
    const count = commandBuffer ? parseInt(commandBuffer) || 1 : 1;

    const command: MotionCommand = {
      type: "MOTION",
      command: direction,
      direction,
      count,
    };

    handler(command);

    // Clear the command buffer after executing the motion
    if (commandBuffer) {
      this.dependencies.sendModeEvent({ type: "CLEAR_BUFFER" });
    }

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

  /**
   * Create a VimCommand from input and key
   */
  private createCommandFromInput(input: string, key: any): VimCommand | null {
    const direction = this.getDirectionFromInput(input);
    if (direction) {
      const commandBuffer = this.dependencies.getCommandBuffer();
      const count = commandBuffer ? parseInt(commandBuffer) || 1 : 1;

      return {
        type: "MOTION",
        command: direction,
        direction,
        count,
      } as MotionCommand;
    }

    // Handle other command types as needed
    return null;
  }
}
