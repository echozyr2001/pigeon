// Enhanced error handling system for ink-vim-mode
// Provides descriptive error messages with suggestions and location information

export type VimErrorType =
  | "REGISTRATION_FAILED"
  | "INPUT_PROCESSING_FAILED"
  | "FOCUS_FAILED"
  | "PANEL_CONFLICT"
  | "INVALID_CONFIGURATION"
  | "HOOK_USAGE_ERROR";

export interface VimError {
  type: VimErrorType;
  message: string;
  panelId?: string;
  originalError?: Error;
  timestamp: Date;
  location?: string;
  suggestion?: string;
}

export interface ErrorTemplate {
  description: string;
  suggestion: string;
  severity: "warning" | "error";
}

/**
 * Enhanced error handler that provides descriptive error messages
 * with suggested solutions and location information for debugging
 */
export class VimErrorHandler {
  private static instance: VimErrorHandler | null = null;
  private errorHistory: VimError[] = [];
  private errorTemplates: Map<VimErrorType, ErrorTemplate>;

  private constructor() {
    this.errorTemplates = new Map([
      [
        "REGISTRATION_FAILED",
        {
          description: "Panel registration failed",
          suggestion:
            "Ensure panel ID is unique and relationships are valid. Check for circular references in spatial relationships.",
          severity: "error",
        },
      ],
      [
        "INPUT_PROCESSING_FAILED",
        {
          description: "Input processing encountered an error",
          suggestion:
            "Check that input handlers are properly defined and don't throw exceptions. Ensure mode-specific callbacks are provided.",
          severity: "error",
        },
      ],
      [
        "FOCUS_FAILED",
        {
          description: "Panel focus operation failed",
          suggestion:
            "Verify the panel is registered and the panel ID exists. Check spatial relationships for connectivity.",
          severity: "error",
        },
      ],
      [
        "PANEL_CONFLICT",
        {
          description: "Panel ID conflict detected",
          suggestion:
            "Use unique panel IDs across all components. Consider using a prefix or namespace for panel IDs.",
          severity: "warning",
        },
      ],
      [
        "INVALID_CONFIGURATION",
        {
          description: "Invalid configuration detected",
          suggestion:
            "Review the configuration options and ensure all required fields are provided with valid values.",
          severity: "error",
        },
      ],
      [
        "HOOK_USAGE_ERROR",
        {
          description: "Incorrect hook usage detected",
          suggestion:
            "Review the hook documentation and ensure proper usage patterns. Consider using useVimEditor for most use cases.",
          severity: "warning",
        },
      ],
    ]);
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): VimErrorHandler {
    if (!VimErrorHandler.instance) {
      VimErrorHandler.instance = new VimErrorHandler();
    }
    return VimErrorHandler.instance;
  }

  /**
   * Create and log a descriptive error
   */
  public createError(
    type: VimErrorType,
    details: {
      panelId?: string;
      originalError?: Error;
      location?: string;
      customMessage?: string;
      customSuggestion?: string;
    } = {}
  ): VimError {
    const template = this.errorTemplates.get(type);
    if (!template) {
      throw new Error(`Unknown error type: ${type}`);
    }

    const error: VimError = {
      type,
      message: details.customMessage || template.description,
      panelId: details.panelId,
      originalError: details.originalError,
      timestamp: new Date(),
      location: details.location || this.captureLocation(),
      suggestion: details.customSuggestion || template.suggestion,
    };

    this.addToHistory(error);
    this.logError(error, template.severity);

    return error;
  }

  /**
   * Handle panel registration errors with specific guidance
   */
  public handleRegistrationError(
    panelId: string,
    relationships: any,
    originalError?: Error
  ): VimError {
    let customMessage = `Failed to register panel "${panelId}"`;
    let customSuggestion = this.errorTemplates.get(
      "REGISTRATION_FAILED"
    )!.suggestion;

    // Provide specific guidance based on the error
    if (originalError?.message.includes("circular")) {
      customMessage += " due to circular reference in spatial relationships";
      customSuggestion =
        "Remove circular references in panel relationships. Each panel should have a clear path without loops.";
    } else if (originalError?.message.includes("duplicate")) {
      customMessage += " because panel ID already exists";
      customSuggestion =
        "Use a unique panel ID. Consider adding a prefix or using a UUID for uniqueness.";
    } else if (relationships && Object.keys(relationships).length === 0) {
      customMessage += " with empty relationships";
      customSuggestion =
        "Provide at least one spatial relationship (left, right, up, down) or use autoRegister: true for automatic management.";
    }

    return this.createError("REGISTRATION_FAILED", {
      panelId,
      originalError,
      customMessage,
      customSuggestion,
      location: `Panel registration for "${panelId}"`,
    });
  }

  /**
   * Handle input processing errors with mode-specific guidance
   */
  public handleInputProcessingError(
    mode: string,
    input: string,
    panelId?: string,
    originalError?: Error
  ): VimError {
    let customMessage = `Input processing failed in ${mode} mode`;
    let customSuggestion = this.errorTemplates.get(
      "INPUT_PROCESSING_FAILED"
    )!.suggestion;

    // Provide mode-specific guidance
    if (mode === "INSERT") {
      customMessage += " for text input";
      customSuggestion =
        "Ensure onInsertInput callback is defined and handles text input properly. Check for exceptions in the callback.";
    } else if (mode === "NORMAL") {
      customMessage += " for Vim command";
      customSuggestion =
        "Ensure onNormalInput callback is defined and handles Vim commands properly. Check command parsing logic.";
    } else if (mode === "COMMAND") {
      customMessage += " for command input";
      customSuggestion =
        "Ensure onCommandInput callback is defined and handles command line input properly.";
    }

    if (input) {
      customMessage += ` (input: "${input}")`;
    }

    return this.createError("INPUT_PROCESSING_FAILED", {
      panelId,
      originalError,
      customMessage,
      customSuggestion,
      location: panelId ? `Panel "${panelId}" in ${mode} mode` : `${mode} mode`,
    });
  }

  /**
   * Handle focus operation errors
   */
  public handleFocusError(
    targetPanelId: string,
    currentPanelId?: string,
    originalError?: Error
  ): VimError {
    let customMessage = `Failed to focus panel "${targetPanelId}"`;
    let customSuggestion = this.errorTemplates.get("FOCUS_FAILED")!.suggestion;

    if (currentPanelId) {
      customMessage += ` from panel "${currentPanelId}"`;
    }

    // Check for common focus issues
    if (originalError?.message.includes("not registered")) {
      customSuggestion = `Panel "${targetPanelId}" is not registered. Register the panel using useVimNavigation.register() or set autoRegister: true in useVimEditor.`;
    } else if (originalError?.message.includes("not connected")) {
      customSuggestion = `Panel "${targetPanelId}" is not spatially connected to the current panel. Check spatial relationships configuration.`;
    }

    return this.createError("FOCUS_FAILED", {
      panelId: targetPanelId,
      originalError,
      customMessage,
      customSuggestion,
      location: `Focus operation: ${
        currentPanelId || "unknown"
      } -> ${targetPanelId}`,
    });
  }

  /**
   * Handle hook usage errors with specific recommendations
   */
  public handleHookUsageError(
    hookName: string,
    panelId: string,
    issue: string,
    originalError?: Error
  ): VimError {
    let customMessage = `Incorrect usage of ${hookName} in panel "${panelId}": ${issue}`;
    let customSuggestion: string;

    // Provide hook-specific guidance
    switch (hookName) {
      case "useVimInput":
        customSuggestion =
          "Consider using useVimEditor instead for better integration and automatic lifecycle management.";
        break;
      case "useVimModeAwareInput":
        customSuggestion =
          "Use useVimEditor with mode-specific callbacks (onInsertInput, onNormalInput, etc.) for cleaner code.";
        break;
      case "useVimUnhandledInput":
        customSuggestion =
          "This hook should only be used for global input handling. For panel-specific input, use useVimEditor.";
        break;
      default:
        customSuggestion =
          "Review the hook documentation and ensure proper usage patterns.";
    }

    return this.createError("HOOK_USAGE_ERROR", {
      panelId,
      originalError,
      customMessage,
      customSuggestion,
      location: `${hookName} in panel "${panelId}"`,
    });
  }

  /**
   * Get error history
   */
  public getErrorHistory(): VimError[] {
    return [...this.errorHistory];
  }

  /**
   * Get errors for a specific panel
   */
  public getErrorsForPanel(panelId: string): VimError[] {
    return this.errorHistory.filter((error) => error.panelId === panelId);
  }

  /**
   * Clear error history
   */
  public clearErrorHistory(): void {
    this.errorHistory = [];
  }

  /**
   * Get recent errors (last 10)
   */
  public getRecentErrors(): VimError[] {
    return this.errorHistory.slice(-10);
  }

  /**
   * Check if there are any recent errors of a specific type
   */
  public hasRecentErrors(
    type: VimErrorType,
    withinMinutes: number = 5
  ): boolean {
    const cutoff = new Date(Date.now() - withinMinutes * 60 * 1000);
    return this.errorHistory.some(
      (error) => error.type === type && error.timestamp > cutoff
    );
  }

  /**
   * Add error to history
   */
  private addToHistory(error: VimError): void {
    this.errorHistory.push(error);

    // Keep only the last 50 errors to prevent memory leaks
    if (this.errorHistory.length > 50) {
      this.errorHistory = this.errorHistory.slice(-50);
    }
  }

  /**
   * Log error with consistent formatting
   */
  private logError(error: VimError, severity: "warning" | "error"): void {
    const icon = severity === "error" ? "❌" : "⚠️";
    const prefix = `${icon} ink-vim-mode: ${error.type}`;

    let message = `${prefix} - ${error.message}`;

    if (error.suggestion) {
      message += `\n💡 Suggestion: ${error.suggestion}`;
    }

    if (error.location) {
      message += `\n📍 Location: ${error.location}`;
    }

    if (error.originalError && error.originalError.message) {
      message += `\n🔍 Details: ${error.originalError.message}`;
    }

    if (severity === "error") {
      console.error(message);
    } else {
      console.warn(message);
    }
  }

  /**
   * Capture location information for debugging
   */
  private captureLocation(): string {
    try {
      const stack = new Error().stack;
      if (stack) {
        const lines = stack.split("\n");
        // Find the first line that's not from this error handler
        for (let i = 2; i < lines.length; i++) {
          const line = lines[i];
          if (
            line &&
            !line.includes("ErrorHandler") &&
            !line.includes("DevWarningManager")
          ) {
            // Extract function name and file info
            const match = line.match(/at\s+(.+?)\s+\((.+?)\)/);
            if (match) {
              const [, functionName, fileInfo] = match;
              return `${functionName} (${fileInfo})`;
            }
            return line.trim();
          }
        }
      }
    } catch (error) {
      // Ignore stack capture errors
    }

    return "Unknown location";
  }

  /**
   * Reset singleton instance (useful for testing)
   */
  public static reset(): void {
    VimErrorHandler.instance = null;
  }
}

// Export singleton instance for convenience
export const vimErrorHandler = VimErrorHandler.getInstance();
