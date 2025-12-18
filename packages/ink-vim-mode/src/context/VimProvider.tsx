// VimProvider React Context component

import React, {
  createContext,
  useContext,
  useState,
  useMemo,
  useCallback,
} from "react";
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

  // Memoize callback functions to prevent unnecessary re-renders
  const getCurrentMode = useCallback(
    (): VimMode => state.value as VimMode,
    [state.value]
  );
  const getActivePanelId = useCallback(() => activePanelId, [activePanelId]);
  const getCommandBuffer = useCallback(
    () => state.context.commandBuffer,
    [state.context.commandBuffer]
  );
  const getPanelRegistry = useCallback(() => panelRegistry, [panelRegistry]);
  const sendModeEvent = useCallback(
    (event: VimModeEvent) => send(event),
    [send]
  );
  const focusPanel = useCallback((panelId: string) => {
    setActivePanelId(panelId);
  }, []);

  // Initialize InputDispatcher with memoized dependencies
  const inputDispatcher = useMemo(() => {
    const dependencies = {
      getCurrentMode,
      getActivePanelId,
      getCount: () => state.context.count,
      getCommandBuffer,
      getPanelRegistry,
      sendModeEvent,
      focusPanel,
    };

    return new InputDispatcher(dependencies);
  }, [
    getCurrentMode,
    getActivePanelId,
    getCommandBuffer,
    getPanelRegistry,
    sendModeEvent,
    focusPanel,
  ]);

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      // Clean up panel registry
      panelRegistry.clear();
      // Clean up input dispatcher
      inputDispatcher.destroy();
    };
  }, [panelRegistry, inputDispatcher]);

  // Memoize context values to prevent unnecessary re-renders
  const contextValue: VimContextState = useMemo(
    () => ({
      mode: state.value as VimMode,
      activePanelId,
      count: state.context.count,
      commandBuffer: state.context.commandBuffer,
      panelRegistry,
      statusMessage: state.context.statusMessage,
      commandInput: state.context.commandInput,
    }),
    [
      state.value,
      activePanelId,
      state.context.commandBuffer,
      panelRegistry,
      state.context.statusMessage,
      state.context.commandInput,
    ]
  );

  // Memoize extended context value
  const extendedContextValue: VimContextExtended = useMemo(
    () => ({
      ...contextValue,
      send,
      inputDispatcher,
      setActivePanelId,
    }),
    [contextValue, send, inputDispatcher, setActivePanelId]
  );

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
