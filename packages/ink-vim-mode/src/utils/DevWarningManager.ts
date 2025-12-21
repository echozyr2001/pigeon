// Development Warning System for ink-vim-mode
// Provides centralized warning handling with environment detection

// Global declarations for environment detection
declare const process: any;
declare const window: any;

export type WarningType =
  | "HOOK_CONFLICT"
  | "UNREGISTERED_PANEL"
  | "DEPRECATED_PATTERN";

export interface DevWarning {
  type: WarningType;
  message: string;
  panelId?: string;
  timestamp: Date;
  stack?: string;
}

export interface DevWarningConfig {
  enabled: boolean; // process.env.NODE_ENV === 'development'
  warnOnHookConflicts: boolean;
  warnOnUnregisteredPanels: boolean;
  warnOnDeprecatedPatterns: boolean;
}

/**
 * Centralized warning manager for development-time warnings
 * Automatically detects environment and provides helpful warnings
 * for common ink-vim-mode usage mistakes
 */
export class DevWarningManager {
  private static instance: DevWarningManager | null = null;
  private config: DevWarningConfig;
  private activeHooks: Set<string>;
  private registeredPanels: Set<string>;
  private warnings: DevWarning[];

  private constructor() {
    this.config = {
      enabled: this.isDevelopmentEnvironment(),
      warnOnHookConflicts: true,
      warnOnUnregisteredPanels: true,
      warnOnDeprecatedPatterns: true,
    };
    this.activeHooks = new Set();
    this.registeredPanels = new Set();
    this.warnings = [];
  }

  /**
   * Get singleton instance of DevWarningManager
   */
  public static getInstance(): DevWarningManager {
    if (!DevWarningManager.instance) {
      DevWarningManager.instance = new DevWarningManager();
    }
    return DevWarningManager.instance;
  }

  /**
   * Detect if we're running in development environment
   */
  private isDevelopmentEnvironment(): boolean {
    // Check Node.js environment variable
    try {
      if (typeof process !== "undefined" && process?.env) {
        return process.env.NODE_ENV === "development";
      }
    } catch {
      // process is not available, continue to browser checks
    }

    // Fallback for browser environments - check for common dev indicators
    try {
      if (typeof window !== "undefined") {
        // Check for development server indicators
        const hostname = window.location?.hostname;
        if (
          hostname === "localhost" ||
          hostname === "127.0.0.1" ||
          hostname?.endsWith(".local")
        ) {
          return true;
        }
      }
    } catch {
      // window is not available
    }

    // Default to false for production safety
    return false;
  }

  /**
   * Update configuration
   */
  public configure(config: Partial<DevWarningConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  public getConfig(): DevWarningConfig {
    return { ...this.config };
  }

  /**
   * Register a hook as active for conflict detection
   */
  public registerActiveHook(hookName: string, panelId: string): void {
    if (!this.config.enabled || !this.config.warnOnHookConflicts) {
      return;
    }

    const hookKey = `${panelId}:${hookName}`;

    // Check for conflicts with existing hooks on the same panel
    const existingHooks = Array.from(this.activeHooks)
      .filter((key) => key.startsWith(`${panelId}:`))
      .map((key) => key.split(":")[1])
      .filter((hookName): hookName is string => hookName !== undefined);

    if (existingHooks.length > 0) {
      this.warnHookConflict(hookName, panelId, existingHooks);
    }

    this.activeHooks.add(hookKey);
  }

  /**
   * Unregister a hook when component unmounts
   */
  public unregisterActiveHook(hookName: string, panelId: string): void {
    const hookKey = `${panelId}:${hookName}`;
    this.activeHooks.delete(hookKey);
  }

  /**
   * Register a panel as properly registered
   */
  public registerPanel(panelId: string): void {
    this.registeredPanels.add(panelId);
  }

  /**
   * Unregister a panel
   */
  public unregisterPanel(panelId: string): void {
    this.registeredPanels.delete(panelId);

    // Clean up associated hook registrations
    const hooksToRemove = Array.from(this.activeHooks).filter((key) =>
      key.startsWith(`${panelId}:`)
    );

    hooksToRemove.forEach((hookKey) => {
      this.activeHooks.delete(hookKey);
    });
  }

  /**
   * Warn about hook conflicts
   */
  public warnHookConflict(
    hookName: string,
    panelId: string,
    existingHooks?: string[]
  ): void {
    if (!this.config.enabled || !this.config.warnOnHookConflicts) {
      return;
    }

    const existing =
      existingHooks ||
      Array.from(this.activeHooks)
        .filter((key) => key.startsWith(`${panelId}:`))
        .map((key) => key.split(":")[1])
        .filter((hookName): hookName is string => hookName !== undefined);

    const message = this.formatWarningMessage(
      "HOOK_CONFLICT",
      `Multiple input hooks detected in panel "${panelId}"`,
      `Replace ${existing.join(
        " + "
      )} + ${hookName} with useVimEditor for better integration`,
      `Panel: ${panelId}`
    );

    this.addWarning({
      type: "HOOK_CONFLICT",
      message,
      panelId,
      timestamp: new Date(),
      stack: this.captureStack(),
    });

    console.warn(message);
  }

  /**
   * Warn about unregistered panels
   */
  public warnUnregisteredPanel(panelId: string): void {
    if (!this.config.enabled || !this.config.warnOnUnregisteredPanels) {
      return;
    }

    if (this.registeredPanels.has(panelId)) {
      return; // Panel is properly registered
    }

    const message = this.formatWarningMessage(
      "UNREGISTERED_PANEL",
      `Component uses Vim input without proper panel registration`,
      `Register panel "${panelId}" using useVimNavigation or set autoRegister: true in useVimEditor`,
      `Panel: ${panelId}`
    );

    this.addWarning({
      type: "UNREGISTERED_PANEL",
      message,
      panelId,
      timestamp: new Date(),
      stack: this.captureStack(),
    });

    console.warn(message);
  }

  /**
   * Warn about deprecated patterns
   */
  public warnDeprecatedPattern(
    oldPattern: string,
    newPattern: string,
    panelId?: string
  ): void {
    if (!this.config.enabled || !this.config.warnOnDeprecatedPatterns) {
      return;
    }

    const message = this.formatWarningMessage(
      "DEPRECATED_PATTERN",
      `Deprecated pattern "${oldPattern}" detected`,
      `Use "${newPattern}" instead for better maintainability`,
      panelId ? `Panel: ${panelId}` : undefined
    );

    this.addWarning({
      type: "DEPRECATED_PATTERN",
      message,
      panelId,
      timestamp: new Date(),
      stack: this.captureStack(),
    });

    console.warn(message);
  }

  /**
   * Get all warnings
   */
  public getWarnings(): DevWarning[] {
    return [...this.warnings];
  }

  /**
   * Clear all warnings
   */
  public clearWarnings(): void {
    this.warnings = [];
  }

  /**
   * Get warnings for a specific panel
   */
  public getWarningsForPanel(panelId: string): DevWarning[] {
    return this.warnings.filter((warning) => warning.panelId === panelId);
  }

  /**
   * Check if warnings are enabled
   */
  public isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Format warning message with consistent styling
   */
  private formatWarningMessage(
    type: WarningType,
    description: string,
    suggestion: string,
    location?: string
  ): string {
    let message = `⚠️  ink-vim-mode: ${type} - ${description}\n`;
    message += `💡 Suggestion: ${suggestion}`;

    if (location) {
      message += `\n📍 Location: ${location}`;
    }

    return message;
  }

  /**
   * Add warning to internal list
   */
  private addWarning(warning: DevWarning): void {
    this.warnings.push(warning);

    // Keep only the last 100 warnings to prevent memory leaks
    if (this.warnings.length > 100) {
      this.warnings = this.warnings.slice(-100);
    }
  }

  /**
   * Capture stack trace for debugging
   */
  private captureStack(): string | undefined {
    if (!this.config.enabled) {
      return undefined;
    }

    try {
      const stack = new Error().stack;
      if (stack) {
        // Remove the first few lines that are internal to the warning system
        const lines = stack.split("\n");
        return lines.slice(3).join("\n");
      }
    } catch (error) {
      // Ignore stack capture errors
    }

    return undefined;
  }

  /**
   * Reset the singleton instance (useful for testing)
   */
  public static reset(): void {
    DevWarningManager.instance = null;
  }
}

// Export singleton instance for convenience
export const devWarningManager = DevWarningManager.getInstance();
