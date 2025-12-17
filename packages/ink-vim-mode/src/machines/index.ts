// XState machines for Vim mode management
import { createMachine, assign } from "xstate";
import type { VimModeContext, VimModeEvent, VimMode } from "../types/index.js";

export const vimModeMachine = createMachine({
  id: "vimMode",
  types: {} as {
    context: VimModeContext;
    events: VimModeEvent;
  },
  initial: "NORMAL",
  context: {
    previousMode: "NORMAL" as VimMode,
    commandBuffer: "",
    count: 0,
    statusMessage: null,
  },
  states: {
    NORMAL: {
      on: {
        ENTER_INSERT: {
          target: "INSERT",
          actions: assign({
            previousMode: "NORMAL",
          }),
        },
        ENTER_VISUAL: {
          target: "VISUAL",
          actions: assign({
            previousMode: "NORMAL",
          }),
        },
        ENTER_COMMAND: {
          target: "COMMAND",
          actions: assign({
            previousMode: "NORMAL",
          }),
        },
        APPEND_BUFFER: {
          actions: assign({
            commandBuffer: ({ context, event }) => {
              // Only append digits in NORMAL mode for numeric prefixes
              if (/^\d$/.test(event.char)) {
                return context.commandBuffer + event.char;
              }
              return context.commandBuffer;
            },
            count: ({ context, event }) => {
              if (/^\d$/.test(event.char)) {
                const newBuffer = context.commandBuffer + event.char;
                return parseInt(newBuffer) || 0;
              }
              return context.count;
            },
          }),
        },
        CLEAR_BUFFER: {
          actions: assign({
            commandBuffer: "",
            count: 0,
          }),
        },
        ESCAPE: {
          actions: assign({
            commandBuffer: "",
            count: 0,
            statusMessage: null,
          }),
        },
      },
    },
    INSERT: {
      on: {
        ESCAPE: {
          target: "NORMAL",
          actions: assign({
            previousMode: "INSERT",
            commandBuffer: "",
            count: 0,
            statusMessage: null,
          }),
        },
      },
    },
    VISUAL: {
      on: {
        ESCAPE: {
          target: "NORMAL",
          actions: assign({
            previousMode: "VISUAL",
            commandBuffer: "",
            count: 0,
            statusMessage: null,
          }),
        },
        ENTER_INSERT: {
          target: "INSERT",
          actions: assign({
            previousMode: "VISUAL",
          }),
        },
        ENTER_COMMAND: {
          target: "COMMAND",
          actions: assign({
            previousMode: "VISUAL",
          }),
        },
      },
    },
    COMMAND: {
      on: {
        ESCAPE: {
          target: "NORMAL",
          actions: assign({
            previousMode: "COMMAND",
            commandBuffer: "",
            count: 0,
            statusMessage: null,
          }),
        },
        EXECUTE_COMMAND: {
          target: "NORMAL",
          actions: assign({
            previousMode: "COMMAND",
            commandBuffer: "",
            count: 0,
            statusMessage: ({ event }) => `Executed: ${event.command}`,
          }),
        },
      },
    },
  },
});
