// VimProvider React Context component

import React, { createContext, useContext, useState, useMemo } from "react";
import { useMachine } from "@xstate/react";
import { vimModeMachine } from "../machines/index.js";
import { PanelRegistry } from "../registry/index.js";
import { InputDispatcher } from "../dispatcher/index.js";
import type {
  VimContextState,
  VimContextExtended,
  VimModeEvent,
  VimMode,
} from "../types/index.js";

// Create the React Context
const VimContext = createContext<VimContextExtended | null>(null);

// Context provider component
export function VimProvider({ children }: { children: React.ReactNode }) {
  // Initialize XState machine
  const [state, send] = useMachine(vimModeMachine);

  // Initialize PanelRegistry (stable across re-renders)
  const panelRegistry = useMemo(() => new PanelRegistry(), []);

  // Track active panel ID
  const [activePanelId, setActivePanelId] = useState<string | null>(null);

  // Initialize InputDispatcher with dependencies
  const inputDispatcher = useMemo(() => {
    const dependencies = {
      getCurrentMode: (): VimMode => state.value as VimMode,
      getActivePanelId: () => activePanelId,
      getCommandBuffer: () => state.context.commandBuffer,
      getPanelRegistry: () => panelRegistry,
      sendModeEvent: (event: VimModeEvent) => send(event),
      focusPanel: (panelId: string) => {
        setActivePanelId(panelId);
      },
    };

    return new InputDispatcher(dependencies);
  }, [
    state.value,
    state.context.commandBuffer,
    activePanelId,
    panelRegistry,
    send,
  ]);

  // Create context value
  const contextValue: VimContextState = {
    mode: state.value as VimMode,
    activePanelId,
    commandBuffer: state.context.commandBuffer,
    panelRegistry,
    statusMessage: state.context.statusMessage,
  };

  // Expose additional methods for hooks
  const extendedContextValue: VimContextExtended = {
    ...contextValue,
    send,
    inputDispatcher,
    setActivePanelId,
  };

  return (
    <VimContext.Provider value={extendedContextValue}>
      {children}
    </VimContext.Provider>
  );
}

// Hook to access Vim context
export function useVimContext() {
  const context = useContext(VimContext);
  if (!context) {
    throw new Error("useVimContext must be used within a VimProvider");
  }
  return context;
}
