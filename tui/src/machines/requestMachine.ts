import { createMachine, assign } from "xstate";
import type { FfiRequest, FfiResponse } from "@/types";
import { createDebugMachine } from "@/debug/xstateDebug";

// Request lifecycle states
export type RequestState =
  | "idle"
  | "preparing"
  | "sending"
  | "completed"
  | "error";

// Context interface
export interface RequestContext {
  request?: FfiRequest;
  response?: FfiResponse;
  error?: string;
  isLoading: boolean;
}

// Events
export type RequestEvent =
  | { type: "PREPARE_REQUEST"; request: FfiRequest }
  | { type: "SEND_REQUEST" }
  | { type: "REQUEST_SUCCESS"; response: FfiResponse }
  | { type: "REQUEST_ERROR"; error: string }
  | { type: "RESET" };

// Request lifecycle state machine with debugging
const baseRequestMachine = createMachine({
  id: "request",
  types: {} as {
    context: RequestContext;
    events: RequestEvent;
  },
  initial: "idle",
  context: {
    request: undefined,
    response: undefined,
    error: undefined,
    isLoading: false,
  },

  states: {
    idle: {
      on: {
        PREPARE_REQUEST: {
          target: "preparing",
          actions: assign({
            request: ({ event }) => event.request,
            error: undefined,
            response: undefined,
            isLoading: true,
          }),
        },
      },
    },
    preparing: {
      on: {
        SEND_REQUEST: {
          target: "sending",
          actions: assign({
            isLoading: true,
          }),
        },
        RESET: {
          target: "idle",
          actions: assign({
            request: undefined,
            error: undefined,
            response: undefined,
            isLoading: false,
          }),
        },
      },
    },
    sending: {
      on: {
        REQUEST_SUCCESS: {
          target: "completed",
          actions: assign({
            response: ({ event }) => event.response,
            isLoading: false,
            error: undefined,
          }),
        },
        REQUEST_ERROR: {
          target: "error",
          actions: assign({
            error: ({ event }) => event.error,
            isLoading: false,
          }),
        },
        RESET: {
          target: "idle",
          actions: assign({
            request: undefined,
            error: undefined,
            response: undefined,
            isLoading: false,
          }),
        },
      },
    },
    completed: {
      on: {
        PREPARE_REQUEST: {
          target: "preparing",
          actions: assign({
            request: ({ event }) => event.request,
            error: undefined,
            response: undefined,
            isLoading: true,
          }),
        },
        RESET: {
          target: "idle",
          actions: assign({
            request: undefined,
            error: undefined,
            response: undefined,
            isLoading: false,
          }),
        },
      },
    },
    error: {
      on: {
        PREPARE_REQUEST: {
          target: "preparing",
          actions: assign({
            request: ({ event }) => event.request,
            error: undefined,
            response: undefined,
            isLoading: true,
          }),
        },
        RESET: {
          target: "idle",
          actions: assign({
            request: undefined,
            error: undefined,
            response: undefined,
            isLoading: false,
          }),
        },
      },
    },
  },
});

// Export the machine with debugging capabilities
export const requestMachine = createDebugMachine(baseRequestMachine);
