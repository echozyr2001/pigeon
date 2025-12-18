// React hooks for ink-vim-mode library

import { useEffect, useCallback, useMemo, useRef } from "react";
import { useInput } from "ink";
import { useVimContext } from "../context/VimProvider.js";
import type {
  SpatialRelationships,
  VimCommand,
  VimModeHook,
  VimNavigationHook,
  VimInputHook,
  EditorOperations,
  Direction,
  MotionCommand,
} from "../types";

export function useVimMode(): VimModeHook {
  const context = useVimContext();

  // Memoize the return value to prevent unnecessary re-renders
  return useMemo(
    () => ({
      mode: context.mode,
      send: context.send,
      commandBuffer: context.commandBuffer,
      statusMessage: context.statusMessage,
      commandInput: context.commandInput,
    }),
    [
      context.mode,
      context.send,
      context.commandBuffer,
      context.statusMessage,
      context.commandInput,
    ]
  );
}

export function useVimNavigation(): VimNavigationHook {
  const context = useVimContext();

  // Memoize callback functions to prevent unnecessary re-renders
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

  // Memoize the return value
  return useMemo(
    () => ({
      register,
      unregister,
      focus,
    }),
    [register, unregister, focus]
  );
}

export function useVimInput(
  handler: (command: VimCommand) => void
): VimInputHook {
  const context = useVimContext();

  // Memoize the handler to prevent unnecessary effect re-runs
  const memoizedHandler = useCallback(handler, [handler]);

  // Wrap handler to automatically filter out INSERT and COMMAND modes
  // Application code should never receive commands in these modes
  const wrappedHandler = useCallback(
    (command: VimCommand) => {
      // Only call handler in NORMAL or VISUAL modes
      // Framework ensures INSERT and COMMAND modes don't reach here,
      // but we add this check as a safety measure
      if (context.mode === "INSERT" || context.mode === "COMMAND") {
        return;
      }
      memoizedHandler(command);
    },
    [memoizedHandler, context.mode]
  );

  // Register the component handler with the input dispatcher
  useEffect(() => {
    const panelId = context.activePanelId;
    if (panelId) {
      context.inputDispatcher.registerComponentHandler(panelId, wrappedHandler);

      // Cleanup on unmount or when panelId changes
      return () => {
        context.inputDispatcher.unregisterComponentHandler(panelId);
      };
    }
  }, [context.activePanelId, context.inputDispatcher, wrappedHandler]);

  // Memoize the return value
  return useMemo(
    () => ({
      isActive: context.activePanelId !== null,
      mode: context.mode,
    }),
    [context.activePanelId, context.mode]
  );
}

/**
 * Low-level command subscription hook.
 *
 * This is the primitive that higher-level helpers (like navigation or
 * editor integrations) should be built on. It subscribes the current
 * panel to the command stream produced by the input layer and lets the
 * component decide which commands to consume.
 *
 * Only commands in NORMAL / VISUAL modes are delivered; INSERT and
 * COMMAND mode input stays with the consuming components.
 */
export function useVimCommand(handler: (command: VimCommand) => void): void {
  const context = useVimContext();

  const memoizedHandler = useCallback(handler, [handler]);

  const wrappedHandler = useCallback(
    (command: VimCommand) => {
      // For safety, we still guard against INSERT / COMMAND delivery
      if (context.mode === "INSERT" || context.mode === "COMMAND") {
        return;
      }
      memoizedHandler(command);
    },
    [memoizedHandler, context.mode]
  );

  useEffect(() => {
    const panelId = context.activePanelId;
    if (panelId) {
      context.inputDispatcher.registerComponentHandler(panelId, wrappedHandler);

      return () => {
        context.inputDispatcher.unregisterComponentHandler(panelId);
      };
    }
  }, [context.activePanelId, context.inputDispatcher, wrappedHandler]);
}

/**
 * Hook for handling Vim motion commands (hjkl navigation).
 * Framework automatically filters to only MOTION commands in NORMAL/VISUAL modes.
 * Application code only needs to handle direction and count, without checking command types.
 *
 * @param handler - Function to handle motion commands. Receives (direction, count).
 *                  Only called for MOTION commands in NORMAL/VISUAL modes.
 */
export function useVimMotion(
  handler: (direction: Direction, count: number) => void
): void {
  const memoizedHandler = useCallback(handler, [handler]);

  // Build on top of the more general useVimCommand primitive.
  useVimCommand((command: VimCommand) => {
    if (command.type === "MOTION") {
      const motionCmd = command as MotionCommand;
      memoizedHandler(motionCmd.direction, motionCmd.count);
    }
  });
}

/**
 * Standard Vim-style navigation hook.
 *
 * Framework maps MOTION commands (hjkl with optional count) into
 * semantic callbacks. Components decide what \"move left/right/up/down\"
 * means in their own domain (cursor movement, list selection, etc.).
 */
export function useStandardVimNavigation(handlers: {
  onLeft?: (count: number) => void;
  onRight?: (count: number) => void;
  onUp?: (count: number) => void;
  onDown?: (count: number) => void;
}): void {
  const { onLeft, onRight, onUp, onDown } = handlers;

  useVimCommand((command: VimCommand) => {
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
 * The library handles all Vim commands internally, and only calls this handler for unhandled input.
 *
 * @param handler - Function to handle unhandled input. Receives (input, key) and should return void.
 *                  The handler is only called when dispatcher returns false (input not handled by Vim).
 */
export function useVimUnhandledInput(
  handler: (input: string, key: any) => void
): void {
  const context = useVimContext();

  // Memoize the handler to prevent unnecessary re-runs
  const memoizedHandler = useCallback(handler, [handler]);

  // Use Ink's useInput to receive all input events
  useInput((input, key) => {
    // First, let the Vim dispatcher try to handle the input
    const handledByVim = context.inputDispatcher.process(input, key);

    // Only call the application handler if Vim didn't handle it
    if (!handledByVim) {
      memoizedHandler(input, key);
    }
  });
}

/**
 * Hook for handling input with mode-aware callbacks.
 * The library automatically routes unhandled input to the appropriate callback based on current mode.
 * This eliminates the need for application code to check Vim modes.
 *
 * @param handlers - Object with mode-specific handlers:
 *   - onInsertInput: Called for unhandled input in INSERT mode (text input)
 *   - onNormalInput: Called for unhandled input in NORMAL mode (editor commands)
 *   - onVisualInput: Optional, called for unhandled input in VISUAL mode
 *   - onCommandInput: Optional, called for unhandled input in COMMAND mode
 */
export function useVimModeAwareInput(handlers: {
  onInsertInput: (input: string, key: any) => void;
  onNormalInput: (input: string, key: any) => void;
  onVisualInput?: (input: string, key: any) => void;
  onCommandInput?: (input: string, key: any) => void;
}): void {
  const context = useVimContext();

  // Memoize handlers to prevent unnecessary re-runs
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

  // Use Ink's useInput to receive all input events
  useInput((input, key) => {
    // First, let the Vim dispatcher try to handle the input
    const handledByVim = context.inputDispatcher.process(input, key);

    // Only call the application handler if Vim didn't handle it
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
 * High-level hook for text editor integration.
 * Automatically maps Vim commands to editor operations.
 * Application code only needs to provide editor operation callbacks,
 * without knowing about Vim commands or modes.
 *
 * @param operations - Editor operation callbacks:
 *   - onInsertChar: Called when a character should be inserted (INSERT mode text input)
 *   - onDeleteChar: Called when character at cursor should be deleted (NORMAL mode 'x')
 *   - onDeleteLine: Called when current line should be deleted (NORMAL mode 'dd')
 *   - onInsertNewline: Called when a newline should be inserted (INSERT mode Enter)
 *   - onBackspace: Called when backspace is pressed (INSERT mode Backspace)
 */
export function useVimEditor(operations: EditorOperations): void {
  const context = useVimContext();

  // Memoize operations to prevent unnecessary re-runs
  const memoizedOps = useMemo(
    () => ({
      onInsertChar: operations.onInsertChar,
      onDeleteChar: operations.onDeleteChar,
      onDeleteLine: operations.onDeleteLine,
      onInsertNewline: operations.onInsertNewline,
      onBackspace: operations.onBackspace,
    }),
    [
      operations.onInsertChar,
      operations.onDeleteChar,
      operations.onDeleteLine,
      operations.onInsertNewline,
      operations.onBackspace,
    ]
  );

  // Use Ink's useInput to receive all input events
  useInput((input, key) => {
    // First, let the Vim dispatcher try to handle the input
    const handledByVim = context.inputDispatcher.process(input, key);

    // Only handle unhandled input
    if (!handledByVim && context.mode === "INSERT") {
      // Handle text input in INSERT mode
      if (key.backspace || key.delete) {
        memoizedOps.onBackspace();
        return;
      }

      if (key.return) {
        memoizedOps.onInsertNewline();
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
        memoizedOps.onInsertChar(char);
      }
    }
  });
}

/**
 * High-level hook that maps ACTION-style Vim commands (produced by the
 * parser in NORMAL/VISUAL modes, e.g. x, dd, 3dd) into editor
 * operations. This complements useVimEditor, which focuses on INSERT
 * mode text input.
 */
export function useVimEditorCommands(operations: EditorOperations): void {
  const memoizedOps = useMemo(
    () => ({
      onDeleteChar: operations.onDeleteChar,
      onDeleteLine: operations.onDeleteLine,
    }),
    [operations.onDeleteChar, operations.onDeleteLine]
  );

  useVimCommand((command: VimCommand) => {
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
