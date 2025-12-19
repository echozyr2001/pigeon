// React hooks for ink-vim-mode library

import { useEffect, useCallback, useMemo, useRef } from "react";
import { useInput } from "ink";
import { useVimContext } from "../context/VimProvider";
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
 * High-level hook for text editor integration.
 * Automatically maps Vim commands to editor operations.
 */
export function useVimEditor(
  panelId: string,
  operations: EditorOperations
): void {
  const context = useVimContext();

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
