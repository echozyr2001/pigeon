// React hooks for ink-vim-mode library

import { useEffect } from "react";
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

  return {
    mode: context.mode,
    send: context.send,
    commandBuffer: context.commandBuffer,
    statusMessage: context.statusMessage,
  };
}

export function useVimNavigation(): VimNavigationHook {
  const context = useVimContext();

  const register = (id: string, relationships: SpatialRelationships) => {
    context.panelRegistry.register(id, relationships);
  };

  const unregister = (id: string) => {
    context.panelRegistry.unregister(id);
  };

  const focus = (panelId: string) => {
    context.setActivePanelId(panelId);
  };

  return {
    register,
    unregister,
    focus,
  };
}

export function useVimInput(
  handler: (command: VimCommand) => void
): VimInputHook {
  const context = useVimContext();

  // Register the component handler with the input dispatcher
  useEffect(() => {
    const panelId = context.activePanelId;
    if (panelId) {
      context.inputDispatcher.registerComponentHandler(panelId, handler);

      // Cleanup on unmount or when panelId changes
      return () => {
        context.inputDispatcher.unregisterComponentHandler(panelId);
      };
    }
  }, [context.activePanelId, context.inputDispatcher, handler]);

  return {
    isActive: context.activePanelId !== null,
    mode: context.mode,
  };
}
