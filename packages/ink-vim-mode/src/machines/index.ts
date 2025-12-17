// XState machines for Vim mode management
import { createMachine, assign } from "xstate";
import type { VimModeContext, VimModeEvent, VimMode } from "../types/index";
import { defaultCommandExecutor } from "../commands/index";

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
    commandInput: "",
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
            commandInput: "",
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
            commandInput: "",
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
            commandInput: "",
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
            commandInput: "",
          }),
        },
        EXECUTE_COMMAND: [
          {
            target: "NORMAL",
            guard: ({ event }) => {
              const result = defaultCommandExecutor.execute(event.command);
              return result.success;
            },
            actions: assign({
              previousMode: "COMMAND",
              commandBuffer: "",
              count: 0,
              statusMessage: ({ event }) => {
                const result = defaultCommandExecutor.execute(event.command);
                return result.message || `Executed: ${event.command}`;
              },
              commandInput: "",
            }),
          },
          {
            // Stay in COMMAND mode on error
            actions: assign({
              statusMessage: ({ event }) => {
                const result = defaultCommandExecutor.execute(event.command);
                return result.error || `Failed to execute: ${event.command}`;
              },
              commandInput: "",
            }),
          },
        ],
        UPDATE_COMMAND_INPUT: {
          actions: assign({
            commandInput: ({ event }) => event.input,
          }),
        },
      },
    },
  },
});
