// React hooks for ink-vim-mode library

import { useEffect, useCallback, useMemo } from "react";
import { useVimContext } from "../context/VimProvider.js";
import type {
  SpatialRelationships,
  VimCommand,
  VimModeHook,
  VimNavigationHook,
  VimInputHook,
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

  // Register the component handler with the input dispatcher
  useEffect(() => {
    const panelId = context.activePanelId;
    if (panelId) {
      context.inputDispatcher.registerComponentHandler(
        panelId,
        memoizedHandler
      );

      // Cleanup on unmount or when panelId changes
      return () => {
        context.inputDispatcher.unregisterComponentHandler(panelId);
      };
    }
  }, [context.activePanelId, context.inputDispatcher, memoizedHandler]);

  // Memoize the return value
  return useMemo(
    () => ({
      isActive: context.activePanelId !== null,
      mode: context.mode,
    }),
    [context.activePanelId, context.mode]
  );
}
