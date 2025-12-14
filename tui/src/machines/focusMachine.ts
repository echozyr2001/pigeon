import { createMachine, assign } from "xstate";

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

// Focus management state machine
export const focusMachine = createMachine({
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
        TAB_PREV: {
          target: "responseTabs",
          actions: assign({
            currentField: "url" as TopbarField,
          }),
        },
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
      },
    },
    requestTabs: {
      on: {
        TAB_NEXT: {
          target: "requestPane",
        },
        TAB_PREV: {
          target: "topbar",
          actions: assign({
            currentField: "url" as TopbarField,
          }),
        },
        SET_REQUEST_TAB: {
          actions: assign({
            requestTab: ({ event }) => event.tab,
          }),
        },
      },
    },
    requestPane: {
      entry: assign({
        currentField: ({ context }) => {
          // Set appropriate field based on current request tab
          switch (context.requestTab) {
            case "headers":
              return "headerKey" as RequestField;
            case "body":
              return "contentType" as RequestField;
            default:
              return "headerKey" as RequestField;
          }
        },
      }),
      on: {
        TAB_NEXT: {
          target: "responseTabs",
        },
        TAB_PREV: {
          target: "requestTabs",
        },
        SET_REQUEST_FIELD: {
          actions: assign({
            currentField: ({ event }) => event.field,
          }),
        },
        SET_REQUEST_TAB: {
          actions: [
            assign({
              requestTab: ({ event }) => event.tab,
            }),
            assign({
              currentField: ({ event }) => {
                // Update field based on new tab
                switch (event.tab) {
                  case "headers":
                    return "headerKey" as RequestField;
                  case "body":
                    return "contentType" as RequestField;
                  default:
                    return "headerKey" as RequestField;
                }
              },
            }),
          ],
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
        TAB_PREV: {
          target: "requestPane",
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
