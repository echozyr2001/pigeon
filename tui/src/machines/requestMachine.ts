import { createMachine, assign } from "xstate";
import type { FfiRequest, FfiResponse } from "@/types";

// Request lifecycle states
export type RequestState =
  | "idle"
  | "preparing"
  | "sending"
  | "completed"
  | "error";

// Context interface for request lifecycle
export interface RequestContext {
  request?: FfiRequest;
  response?: FfiResponse;
  error?: string;
  isLoading: boolean; // preparing and sending
}

// Events for request lifecycle
export type RequestEvent =
  | { type: "PREPARE_REQUEST"; request: FfiRequest }
  | { type: "SEND_REQUEST" }
  | { type: "REQUEST_SUCCESS"; response: FfiResponse }
  | { type: "REQUEST_ERROR"; error: string }
  | { type: "RESET" };

// Request lifecycle state machine
export const requestMachine = createMachine({
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
      entry: assign({
        isLoading: false,
        error: undefined,
      }),
      on: {
        PREPARE_REQUEST: {
          target: "preparing",
          actions: assign({
            request: ({ event }) => event.request,
            response: undefined,
            error: undefined,
          }),
        },
      },
    },
    preparing: {
      entry: assign({
        isLoading: true,
      }),
      on: {
        SEND_REQUEST: {
          target: "sending",
        },
        RESET: {
          target: "idle",
        },
      },
    },
    sending: {
      entry: assign({
        isLoading: true,
      }),
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
            response: undefined,
          }),
        },
        RESET: {
          target: "idle",
        },
      },
    },
    completed: {
      entry: assign({
        isLoading: false,
      }),
      on: {
        PREPARE_REQUEST: {
          target: "preparing",
          actions: assign({
            request: ({ event }) => event.request,
            response: undefined,
            error: undefined,
          }),
        },
        RESET: {
          target: "idle",
        },
      },
    },
    error: {
      entry: assign({
        isLoading: false,
      }),
      on: {
        PREPARE_REQUEST: {
          target: "preparing",
          actions: assign({
            request: ({ event }) => event.request,
            response: undefined,
            error: undefined,
          }),
        },
        RESET: {
          target: "idle",
        },
      },
    },
  },
});
