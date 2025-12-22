// React hooks for ink-vim-mode library

import { useEffect, useCallback, useMemo, useRef } from "react";
import { useInput } from "ink";
import { useVimContext } from "../context/VimProvider";
import { DevWarningManager } from "../utils/DevWarningManager";
import { vimErrorHandler } from "../utils/ErrorHandler";
import type {
  SpatialRelationships,
  VimCommand,
  VimModeHook,
  VimNavigationHook,
  VimInputHook,
  EditorOperations,
  Direction,
  MotionCommand,
  UseVimEditorOptions,
  UseVimEditorReturn,
} from "../types";

// Helper: Type guard for MotionCommand
function isMotionCommand(command: VimCommand): command is MotionCommand {
  return command.type === "MOTION" && "direction" in command;
}

export function useVimMode(): VimModeHook {
  const context = useVimContext();

  // Return context directly - no need for memoization here
  // Context values are already memoized in VimProvider
  return {
    mode: context.mode,
    send: context.send,
    commandBuffer: context.commandBuffer,
    statusMessage: context.statusMessage,
    commandInput: context.commandInput,
  };
}

export function useVimNavigation(): VimNavigationHook {
  const context = useVimContext();

  // These callbacks are stable because they only depend on the registry
  // which is created once in VimProvider
  const register = useCallback(
    (id: string, relationships: SpatialRelationships) => {
      context.panelRegistry.register(id, relationships);
    },
    [context.panelRegistry]
  );

  const unregister = useCallback(
    (id: string) => {
      context.panelRegistry.unregister(id);
    },
    [context.panelRegistry]
  );

  const focus = useCallback(
    (panelId: string) => {
      context.setActivePanelId(panelId);
    },
    [context.setActivePanelId]
  );

  return useMemo(
    () => ({
      register,
      unregister,
      focus,
    }),
    [register, unregister, focus]
  );
}

/**
 * Core hook for handling Vim commands in a component.
 * Uses ref-based handler storage to avoid re-registration on mode changes.
 *
 * @param panelId - Explicit panel ID for registration (prevents race conditions)
 * @param handler - Command handler function
 */
export function useVimInput(
  panelId: string,
  handler: (command: VimCommand) => void
): VimInputHook {
  const context = useVimContext();

  // Get DevWarningManager instance
  const devWarningManager = useMemo(() => {
    return DevWarningManager.getInstance();
  }, []);

  // Register hook usage for conflict detection
  useEffect(() => {
    devWarningManager.registerActiveHook("useVimInput", panelId);
    return () => {
      devWarningManager.unregisterActiveHook("useVimInput", panelId);
    };
  }, [devWarningManager, panelId]);

  // Store latest handler and mode in refs - updates don't trigger re-registration
  const handlerRef = useRef(handler);
  const modeRef = useRef(context.mode);

  // Update refs on every render
  useEffect(() => {
    handlerRef.current = handler;
    modeRef.current = context.mode;
  }, [handler, context.mode]);

  // Stable wrapper that uses refs
  const wrappedHandler = useCallback((command: VimCommand) => {
    // Check mode using ref (latest value without triggering re-registration)
    if (modeRef.current === "INSERT" || modeRef.current === "COMMAND") {
      return;
    }
    handlerRef.current(command);
  }, []); // Empty deps - never changes

  // Register handler only once when panelId is available
  useEffect(() => {
    if (panelId) {
      context.inputDispatcher.registerComponentHandler(panelId, wrappedHandler);

      return () => {
        context.inputDispatcher.unregisterComponentHandler(panelId);
      };
    }
  }, [panelId, context.inputDispatcher, wrappedHandler]);

  return useMemo(
    () => ({
      isActive: context.activePanelId === panelId,
      mode: context.mode,
      unregister: () => {
        if (panelId) {
          context.inputDispatcher.unregisterComponentHandler(panelId);
        }
      },
    }),
    [context.activePanelId, panelId, context.mode, context.inputDispatcher]
  );
}

/**
 * Low-level command subscription hook.
 * Only commands in NORMAL/VISUAL modes are delivered.
 */
export function useVimCommand(
  panelId: string,
  handler: (command: VimCommand) => void
): void {
  const context = useVimContext();

  const handlerRef = useRef(handler);
  const modeRef = useRef(context.mode);

  useEffect(() => {
    handlerRef.current = handler;
    modeRef.current = context.mode;
  }, [handler, context.mode]);

  const wrappedHandler = useCallback((command: VimCommand) => {
    if (modeRef.current === "INSERT" || modeRef.current === "COMMAND") {
      return;
    }
    handlerRef.current(command);
  }, []);

  useEffect(() => {
    if (panelId) {
      context.inputDispatcher.registerComponentHandler(panelId, wrappedHandler);

      return () => {
        context.inputDispatcher.unregisterComponentHandler(panelId);
      };
    }
  }, [panelId, context.inputDispatcher, wrappedHandler]);
}

/**
 * Hook for handling Vim motion commands (hjkl navigation).
 * Framework automatically filters to only MOTION commands in NORMAL/VISUAL modes.
 */
export function useVimMotion(
  panelId: string,
  handler: (direction: Direction, count: number) => void
): void {
  const memoizedHandler = useCallback(handler, [handler]);

  useVimCommand(panelId, (command: VimCommand) => {
    if (isMotionCommand(command)) {
      memoizedHandler(command.direction, command.count);
    }
  });
}

/**
 * Standard Vim-style navigation hook.
 * Maps MOTION commands into semantic callbacks.
 */
export function useStandardVimNavigation(
  panelId: string,
  handlers: {
    onLeft?: (count: number) => void;
    onRight?: (count: number) => void;
    onUp?: (count: number) => void;
    onDown?: (count: number) => void;
  }
): void {
  const { onLeft, onRight, onUp, onDown } = handlers;

  useVimCommand(panelId, (command: VimCommand) => {
    if (command.type !== "MOTION") {
      return;
    }

    const motion = command as MotionCommand;
    const count = motion.count;

    switch (motion.direction) {
      case "h":
        onLeft?.(count);
        break;
      case "l":
        onRight?.(count);
        break;
      case "k":
        onUp?.(count);
        break;
      case "j":
        onDown?.(count);
        break;
    }
  });
}

/**
 * Hook for handling input that Vim dispatcher doesn't handle.
 * This is useful for application-specific input handling (e.g., text input in INSERT mode).
 */
export function useVimUnhandledInput(
  handler: (input: string, key: any) => void
): void {
  const context = useVimContext();
  const memoizedHandler = useCallback(handler, [handler]);

  // Get DevWarningManager instance
  const devWarningManager = useMemo(() => {
    return DevWarningManager.getInstance();
  }, []);

  // Register hook usage for conflict detection (use a generic panel ID for global hooks)
  useEffect(() => {
    const globalPanelId = "__global__";
    devWarningManager.registerActiveHook("useVimUnhandledInput", globalPanelId);
    return () => {
      devWarningManager.unregisterActiveHook(
        "useVimUnhandledInput",
        globalPanelId
      );
    };
  }, [devWarningManager]);

  useInput((input, key) => {
    const handledByVim = context.inputDispatcher.process(input, key);

    if (!handledByVim) {
      memoizedHandler(input, key);
    }
  });
}

/**
 * Hook for handling input with mode-aware callbacks.
 * Routes unhandled input to the appropriate callback based on current mode.
 */
export function useVimModeAwareInput(handlers: {
  onInsertInput: (input: string, key: any) => void;
  onNormalInput: (input: string, key: any) => void;
  onVisualInput?: (input: string, key: any) => void;
  onCommandInput?: (input: string, key: any) => void;
}): void {
  const context = useVimContext();

  // Get DevWarningManager instance
  const devWarningManager = useMemo(() => {
    return DevWarningManager.getInstance();
  }, []);

  // Register hook usage for conflict detection (use a generic panel ID for global hooks)
  useEffect(() => {
    const globalPanelId = "__global__";
    devWarningManager.registerActiveHook("useVimModeAwareInput", globalPanelId);
    return () => {
      devWarningManager.unregisterActiveHook(
        "useVimModeAwareInput",
        globalPanelId
      );
    };
  }, [devWarningManager]);

  const memoizedOnInsert = useCallback(handlers.onInsertInput, [
    handlers.onInsertInput,
  ]);
  const memoizedOnNormal = useCallback(handlers.onNormalInput, [
    handlers.onNormalInput,
  ]);
  const memoizedOnVisual = handlers.onVisualInput
    ? useCallback(handlers.onVisualInput, [handlers.onVisualInput])
    : undefined;
  const memoizedOnCommand = handlers.onCommandInput
    ? useCallback(handlers.onCommandInput, [handlers.onCommandInput])
    : undefined;

  useInput((input, key) => {
    const handledByVim = context.inputDispatcher.process(input, key);

    if (!handledByVim) {
      const currentMode = context.mode;
      switch (currentMode) {
        case "INSERT":
          memoizedOnInsert(input, key);
          break;
        case "NORMAL":
          memoizedOnNormal(input, key);
          break;
        case "VISUAL":
          memoizedOnVisual?.(input, key);
          break;
        case "COMMAND":
          memoizedOnCommand?.(input, key);
          break;
      }
    }
  });
}

/**
 * Legacy implementation for backward compatibility.
 * Automatically maps Vim commands to editor operations.
 */
function useVimEditorLegacy(
  panelId: string,
  operations: EditorOperations
): void {
  const context = useVimContext();

  // Get DevWarningManager instance
  const devWarningManager = useMemo(() => {
    return DevWarningManager.getInstance();
  }, []);

  // Register hook usage for conflict detection and warn about deprecated pattern
  useEffect(() => {
    devWarningManager.registerActiveHook("useVimEditorLegacy", panelId);
    devWarningManager.warnDeprecatedPattern(
      "useVimEditor with EditorOperations",
      "useVimEditor with UseVimEditorOptions",
      panelId
    );
    return () => {
      devWarningManager.unregisterActiveHook("useVimEditorLegacy", panelId);
    };
  }, [devWarningManager, panelId]);

  // Use ref to store latest operations
  const opsRef = useRef(operations);

  useEffect(() => {
    opsRef.current = operations;
  }, [operations]);

  useInput((input, key) => {
    const handledByVim = context.inputDispatcher.process(input, key);

    // Only handle unhandled input in INSERT mode
    if (!handledByVim && context.mode === "INSERT") {
      if (key.backspace || key.delete) {
        opsRef.current.onBackspace();
        return;
      }

      if (key.return) {
        opsRef.current.onInsertNewline();
        return;
      }

      // Handle regular character input
      if (
        input &&
        !key.ctrl &&
        !key.meta &&
        input.length === 1 &&
        (input >= " " || input === "\t")
      ) {
        const char = input === "\t" ? "  " : input;
        opsRef.current.onInsertChar(char);
      }
    }
  });
}

/**
 * Primary useVimEditor hook with overloaded signatures for backward compatibility.
 * Supports both the legacy EditorOperations interface and the new UseVimEditorOptions interface.
 */
export function useVimEditor(options: UseVimEditorOptions): UseVimEditorReturn;
export function useVimEditor(
  panelId: string,
  operations: EditorOperations
): void;
export function useVimEditor(
  optionsOrPanelId: UseVimEditorOptions | string,
  operations?: EditorOperations
): UseVimEditorReturn | void {
  // Type guard to determine which signature is being used
  if (typeof optionsOrPanelId === "string" && operations) {
    // Legacy signature: useVimEditor(panelId, operations)
    return useVimEditorLegacy(optionsOrPanelId, operations);
  } else if (typeof optionsOrPanelId === "object" && optionsOrPanelId.panelId) {
    // New signature: useVimEditor(options)
    return useEnhancedVimEditor(optionsOrPanelId);
  } else {
    throw new Error(
      "Invalid useVimEditor arguments. Expected either (options: UseVimEditorOptions) or (panelId: string, operations: EditorOperations)"
    );
  }
}

/**
 * Enhanced useVimEditor hook with automatic lifecycle management.
 * This is the primary hook for most use cases, providing mode-aware input routing,
 * automatic panel registration, and comprehensive error handling.
 */
export function useEnhancedVimEditor(
  options: UseVimEditorOptions
): UseVimEditorReturn {
  const context = useVimContext();
  const navigation = useVimNavigation();

  // Get DevWarningManager instance
  const devWarningManager = useMemo(() => {
    return DevWarningManager.getInstance();
  }, []);

  const {
    panelId,
    onInsertInput,
    onNormalInput,
    onCommandInput,
    onVisualInput,
    autoRegister = true,
    autoFocus = true,
    relationships = {},
  } = options;

  // Register hook usage for conflict detection
  useEffect(() => {
    devWarningManager.registerActiveHook("useEnhancedVimEditor", panelId);
    return () => {
      devWarningManager.unregisterActiveHook("useEnhancedVimEditor", panelId);
    };
  }, [devWarningManager, panelId]);

  // Store latest callbacks in refs to avoid re-registration
  const callbacksRef = useRef({
    onInsertInput,
    onNormalInput,
    onCommandInput,
    onVisualInput,
  });

  useEffect(() => {
    callbacksRef.current = {
      onInsertInput,
      onNormalInput,
      onCommandInput,
      onVisualInput,
    };
  }, [onInsertInput, onNormalInput, onCommandInput, onVisualInput]);

  // Store context in ref for use in setTimeout
  const contextRef = useRef(context);

  // Update ref on every render
  useEffect(() => {
    contextRef.current = context;
  }, [context]);

  // Automatic panel registration and cleanup
  // Use ref to prevent duplicate registrations
  const hasRegisteredRef = useRef(false);

  useEffect(() => {
    // Only register once per component lifecycle
    if (autoRegister && panelId && !hasRegisteredRef.current) {
      try {
        // Register panel
        navigation.register(panelId, relationships);
        devWarningManager.registerPanel(panelId);
        hasRegisteredRef.current = true;

        // Auto-focus if no active panel and autoFocus is enabled
        // Use setTimeout to ensure all panels in the tree have had a chance to register
        if (autoFocus) {
          setTimeout(() => {
            // Get the CURRENT active panel state from ref
            const currentActive = contextRef.current.activePanelId;
            if (!currentActive) {
              navigation.focus(panelId);
            }
          }, 0);
        }

        return () => {
          try {
            // Cleanup on unmount
            navigation.unregister(panelId);
            devWarningManager.unregisterPanel(panelId);
            hasRegisteredRef.current = false;
          } catch (error) {
            vimErrorHandler.createError("REGISTRATION_FAILED", {
              panelId,
              originalError:
                error instanceof Error ? error : new Error(String(error)),
              customMessage: `Failed to unregister panel "${panelId}" during cleanup`,
              location: `useEnhancedVimEditor cleanup for panel "${panelId}"`,
            });
          }
        };
      } catch (error) {
        vimErrorHandler.handleRegistrationError(
          panelId,
          relationships,
          error instanceof Error ? error : new Error(String(error))
        );
        // Don't throw - allow component to continue functioning
      }
    }
  }, [
    autoRegister,
    panelId,
    relationships,
    autoFocus,
    // Note: We intentionally omit context.activePanelId to prevent re-registrations
    // The auto-focus logic uses setTimeout to handle the timing correctly
    navigation,
    devWarningManager,
  ]);

  // Mode-aware input handling
  useInput((input, key) => {
    // Skip empty inputs that are not actual key presses or control keys
    // These are often internal Ink events or terminal artifacts
    if (input === "" && !key.ctrl && !key.escape && !key.return && !key.backspace && !key.delete) {
      return;
    }

    // Terminal compatibility: Skip backspace/delete when in NORMAL mode
    // These are handled by the dispatcher for spatial navigation
    if ((key.backspace || key.delete) && input === "" && context.mode === "NORMAL") {
      // Let the dispatcher handle this as Ctrl+h equivalent
      context.inputDispatcher.process(input, key);
      return;
    }

    try {
      const handledByVim = context.inputDispatcher.process(input, key);

      if (!handledByVim && context.activePanelId === panelId) {
        const currentMode = context.mode;
        const callbacks = callbacksRef.current;

        try {
          switch (currentMode) {
            case "INSERT":
              callbacks.onInsertInput?.(input, key);
              break;
            case "NORMAL":
              callbacks.onNormalInput?.(input, key);
              break;
            case "COMMAND":
              callbacks.onCommandInput?.(input, key);
              break;
            case "VISUAL":
              callbacks.onVisualInput?.(input, key);
              break;
          }
        } catch (callbackError) {
          vimErrorHandler.handleInputProcessingError(
            currentMode,
            input,
            panelId,
            callbackError instanceof Error
              ? callbackError
              : new Error(String(callbackError))
          );
        }
      }
    } catch (error) {
      vimErrorHandler.handleInputProcessingError(
        context.mode,
        input,
        panelId,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  });

  // Focus and blur functions
  const focus = useCallback(() => {
    try {
      navigation.focus(panelId);
    } catch (error) {
      vimErrorHandler.handleFocusError(
        panelId,
        context.activePanelId || undefined,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }, [navigation, panelId, context.activePanelId]);

  const blur = useCallback(() => {
    try {
      if (context.activePanelId === panelId) {
        context.setActivePanelId(null);
      }
    } catch (error) {
      vimErrorHandler.createError("FOCUS_FAILED", {
        panelId,
        originalError:
          error instanceof Error ? error : new Error(String(error)),
        customMessage: `Failed to blur panel "${panelId}"`,
        location: `useEnhancedVimEditor blur for panel "${panelId}"`,
      });
    }
  }, [context, panelId]);

  return useMemo(
    () => ({
      mode: context.mode,
      isActive: context.activePanelId === panelId,
      commandBuffer: context.commandBuffer,
      statusMessage: context.statusMessage,
      commandInput: context.commandInput,
      focus,
      blur,
    }),
    [
      context.mode,
      context.activePanelId,
      panelId,
      context.commandBuffer,
      context.statusMessage,
      context.commandInput,
      focus,
      blur,
    ]
  );
}

/**
 * Hook that maps ACTION-style Vim commands to editor operations.
 * Complements useVimEditor by handling NORMAL/VISUAL mode actions.
 */
export function useVimEditorCommands(
  panelId: string,
  operations: Pick<EditorOperations, "onDeleteChar" | "onDeleteLine">
): void {
  const memoizedOps = useMemo(
    () => ({
      onDeleteChar: operations.onDeleteChar,
      onDeleteLine: operations.onDeleteLine,
    }),
    [operations.onDeleteChar, operations.onDeleteLine]
  );

  useVimCommand(panelId, (command: VimCommand) => {
    if (command.type !== "ACTION") {
      return;
    }

    const count = command.count ?? 1;

    switch (command.command) {
      case "DELETE_CHAR": {
        for (let i = 0; i < count; i++) {
          memoizedOps.onDeleteChar();
        }
        break;
      }
      case "DELETE_LINE": {
        for (let i = 0; i < count; i++) {
          memoizedOps.onDeleteLine();
        }
        break;
      }
    }
  });
}
