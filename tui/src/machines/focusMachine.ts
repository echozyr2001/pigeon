import { createMachine, assign } from "xstate";
import { createDebugMachine } from "@/debug/xstateDebug";

// Types for focus management
export type FocusTarget =
  | "topbar"
  | "requestTabs"
  | "requestPane"
  | "responseTabs";
export type TopbarField = "method" | "url";
export type RequestField = "headerKey" | "headerValue" | "contentType" | "body";
export type RequestTab =
  | "headers"
  | "body"
  | "query"
  | "auth"
  | "info"
  | "options";
export type ResponseTab = "body" | "headers" | "trace";

// Context interface
export interface FocusContext {
  currentField: TopbarField | RequestField;
  requestTab: RequestTab;
  responseTab: ResponseTab;
}

// Events
export type FocusEvent =
  | { type: "TAB_NEXT" }
  | { type: "TAB_PREV" }
  | { type: "FOCUS_METHOD" }
  | { type: "FOCUS_URL" }
  | { type: "SET_REQUEST_TAB"; tab: RequestTab }
  | { type: "SET_RESPONSE_TAB"; tab: ResponseTab }
  | { type: "SET_REQUEST_FIELD"; field: RequestField };

// Focus management state machine with debugging
const baseFocusMachine = createMachine({
  id: "focus",
  types: {} as {
    context: FocusContext;
    events: FocusEvent;
  },
  initial: "topbar",
  context: {
    currentField: "url" as TopbarField,
    requestTab: "headers" as RequestTab,
    responseTab: "body" as ResponseTab,
  },

  on: {
    FOCUS_METHOD: {
      target: ".topbar",
      actions: assign({
        currentField: "method" as TopbarField,
      }),
    },
    FOCUS_URL: {
      target: ".topbar",
      actions: assign({
        currentField: "url" as TopbarField,
      }),
    },
  },

  states: {
    topbar: {
      on: {
        TAB_NEXT: [
          {
            guard: ({ context }) => context.currentField === "method",
            actions: assign({
              currentField: "url" as TopbarField,
            }),
          },
          {
            target: "requestTabs",
          },
        ],
        TAB_PREV: "responseTabs",
        FOCUS_METHOD: {
          actions: assign({
            currentField: "method" as TopbarField,
          }),
        },
        FOCUS_URL: {
          actions: assign({
            currentField: "url" as TopbarField,
          }),
        },
        SET_REQUEST_TAB: {
          actions: assign({
            requestTab: ({ event }) => event.tab,
          }),
        },
        SET_RESPONSE_TAB: {
          actions: assign({
            responseTab: ({ event }) => event.tab,
          }),
        },
      },
    },
    requestTabs: {
      on: {
        TAB_NEXT: "requestPane",
        TAB_PREV: "topbar",
        SET_REQUEST_TAB: {
          actions: assign({
            requestTab: ({ event }) => event.tab,
          }),
        },
        SET_RESPONSE_TAB: {
          actions: assign({
            responseTab: ({ event }) => event.tab,
          }),
        },
      },
    },
    requestPane: {
      entry: assign({
        currentField: ({ context }) =>
          context.requestTab === "headers" ? "headerKey" : "contentType",
      }),
      on: {
        TAB_NEXT: "responseTabs",
        TAB_PREV: "requestTabs",
        SET_REQUEST_FIELD: {
          actions: assign({
            currentField: ({ event }) => event.field,
          }),
        },
        SET_REQUEST_TAB: {
          actions: assign({
            requestTab: ({ event }) => event.tab,
            currentField: ({ event }) =>
              event.tab === "headers" ? "headerKey" : "contentType",
          }),
        },
        SET_RESPONSE_TAB: {
          actions: assign({
            responseTab: ({ event }) => event.tab,
          }),
        },
      },
    },
    responseTabs: {
      on: {
        TAB_NEXT: {
          target: "topbar",
          actions: assign({
            currentField: "url" as TopbarField,
          }),
        },
        TAB_PREV: "requestPane",
        SET_REQUEST_TAB: {
          actions: assign({
            requestTab: ({ event }) => event.tab,
          }),
        },
        SET_RESPONSE_TAB: {
          actions: assign({
            responseTab: ({ event }) => event.tab,
          }),
        },
      },
    },
  },
});

// Export the machine with debugging capabilities
export const focusMachine = createDebugMachine(baseFocusMachine);
