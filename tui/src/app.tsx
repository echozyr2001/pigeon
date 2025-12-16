import { useEffect, useMemo, useState } from "react";
import { Box, Text, useApp, useInput, useStdin } from "ink";
import { Spinner, StatusMessage, TextInput } from "@inkjs/ui";
import { useMachine } from "@xstate/react";
import type { FfiRequest, HttpMethod, RequestHeader } from "@/types";
import { sendRequestViaRust } from "@/ffi/client";
import { terminateRustWorker } from "@/ffi/client";
import { HSplit, VSplit } from "@/ui/SplitPane";
import { TabBar } from "@/ui/TabBar";
import { KeyHints } from "@/ui/KeyHints";
import { TextArea } from "@/ui/TextArea";
import { DebugPanel } from "@/ui/DebugPanel";
import { MethodDropdown, MethodDropdownMenu } from "@/ui/MethodDropdown";
import { theme } from "@/ui/theme";
import {
  focusMachine,
  type FocusTarget,
  type TopbarField,
  type RequestField,
} from "@/machines/focusMachine";
import { requestMachine, type RequestState } from "@/machines/requestMachine";
import { useXStateDebug } from "@/debug/xstateDebug";

const methodOptions: Array<{ label: string; value: HttpMethod }> = [
  { label: "GET", value: "GET" },
  { label: "POST", value: "POST" },
  { label: "PUT", value: "PUT" },
  { label: "PATCH", value: "PATCH" },
  { label: "DELETE", value: "DELETE" },
  { label: "HEAD", value: "HEAD" },
  { label: "OPTIONS", value: "OPTIONS" },
];

function KeyboardShortcuts(props: {
  onExit: () => void;
  onSend: () => void;
  onTab: () => void;
  onTabPrev?: () => void;
  onFocusMethod?: () => void;
  onFocusUrl?: () => void;
  onToggleDebug?: () => void;
  onClearDebugLogs?: () => void;
  canHandleGlobalShortcut?: () => boolean;
}) {
  useInput((input, key) => {
    const canHandleGlobal = props.canHandleGlobalShortcut?.() ?? true;

    // Avoid quitting while the user is typing (e.g. URL contains 'q').
    if (input === "q" && canHandleGlobal) {
      props.onExit();
      return;
    }

    if (key.ctrl && input === "c") {
      props.onExit();
      return;
    }

    // Many terminals encode Ctrl+J as LF (\n) instead of reporting ctrl+j.
    // We treat LF as the "send-request" binding (Posting default).
    // Important: Enter usually comes as `\r` (and key.return === true).
    // Ctrl+J usually comes as `\n` (and key.return === false).
    if (input === "\n" && !key.return) {
      props.onSend();
      return;
    }

    // Some terminals do report ctrl+j explicitly.
    if (key.ctrl && input === "j") {
      props.onSend();
      return;
    }

    // Best-effort alt+enter (terminals differ; Ink exposes meta, not alt).
    if (key.return && key.meta) {
      props.onSend();
      return;
    }

    if (key.tab && key.shift) {
      props.onTabPrev?.();
      return;
    }

    if (key.tab) {
      props.onTab();
      return;
    }

    // Posting-like quick focus
    if (key.ctrl && input === "t") {
      props.onFocusMethod?.();
    }

    if (key.ctrl && input === "l") {
      props.onFocusUrl?.();
    }

    // Toggle debug panel (only when not actively typing)
    if (input === "d" && !key.ctrl && canHandleGlobal) {
      props.onToggleDebug?.();
    }

    // Clear debug logs
    if (key.ctrl && input === "i") {
      props.onClearDebugLogs?.();
    }
  });

  return null;
}

function formatHeaderPreview(headers: RequestHeader[]): string {
  if (headers.length === 0) return "(none)";
  return headers
    .filter((h) => h.enabled !== false)
    .map((h) => `${h.key}: ${h.value}`)
    .join(" | ");
}

function normalizeHeaders(headers: RequestHeader[]): RequestHeader[] {
  return headers
    .map((h) => ({
      key: h.key.trim(),
      value: h.value.trim(),
      enabled: h.enabled ?? true,
    }))
    .filter((h) => h.key.length > 0);
}

function maybePrettifyJson(text: string): string {
  // Avoid huge parse costs; keep it conservative for now.
  if (text.length > 300_000) return text;
  const trimmed = text.trim();
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return text;
  try {
    const parsed = JSON.parse(trimmed);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return text;
  }
}

export function App() {
  const { exit } = useApp();
  const quit = () => {
    terminateRustWorker("quit");
    exit();
  };
  const { isRawModeSupported } = useStdin();

  // XState debugging with enhanced logging
  const { startTransition, logTransition, logError, clearLogs } =
    useXStateDebug();
  const [debugPanelVisible, setDebugPanelVisible] = useState(false);

  // XState machines
  const [focusState, focusSend] = useMachine(focusMachine);
  const [requestState, requestSend] = useMachine(requestMachine);

  // Track state transitions for debugging with enhanced context
  const [prevFocusState, setPrevFocusState] = useState(focusState.value);
  const [prevRequestState, setPrevRequestState] = useState(requestState.value);

  useEffect(() => {
    if (prevFocusState !== focusState.value) {
      logTransition(
        "focus",
        prevFocusState,
        focusState.value,
        { type: "STATE_CHANGE" },
        undefined, // transitionKey
        focusState.context, // context
        { timestamp: new Date().toISOString() } // meta
      );
      setPrevFocusState(focusState.value);
    }
  }, [focusState.value, prevFocusState, logTransition]);

  useEffect(() => {
    if (prevRequestState !== requestState.value) {
      logTransition(
        "request",
        prevRequestState,
        requestState.value,
        { type: "STATE_CHANGE" },
        undefined, // transitionKey
        requestState.context, // context
        { timestamp: new Date().toISOString() } // meta
      );
      setPrevRequestState(requestState.value);
    }
  }, [requestState.value, prevRequestState, logTransition]);

  // Derived values from state machines
  const focus = focusState.value as FocusTarget;
  const { currentField, requestTab, responseTab } = focusState.context;

  const { response, error, isLoading } = requestState.context;

  // Helper to determine if current field is a topbar field
  const isTopbarField = (field: string): field is TopbarField =>
    field === "method" || field === "url";

  // Helper to determine if current field is a request field
  const isRequestField = (field: string): field is RequestField =>
    field === "headerKey" ||
    field === "headerValue" ||
    field === "contentType" ||
    field === "body";

  const topbarField = isTopbarField(currentField) ? currentField : "url";
  const requestField = isRequestField(currentField)
    ? currentField
    : "headerKey";

  const canHandleGlobalShortcut = () => {
    // If you're currently editing/typing in a field, `q` should be treated as input.
    if (focus === "topbar") return false;
    if (
      focus === "requestPane" &&
      (requestTab === "headers" || requestTab === "body")
    ) {
      return false;
    }
    return true;
  };

  const [method, setMethod] = useState<HttpMethod>("GET");
  const [url, setUrl] = useState<string>("https://httpbin.org/get");
  const [methodDropdownOpen, setMethodDropdownOpen] = useState(false);
  const [methodHighlightedIndex, setMethodHighlightedIndex] = useState(0);

  const [headerKey, setHeaderKey] = useState<string>("");
  const [headerValue, setHeaderValue] = useState<string>("");
  const [headers, setHeaders] = useState<RequestHeader[]>([]);
  const [headerInputNonce, setHeaderInputNonce] = useState(0);

  const [contentType, setContentType] = useState<string>("application/json");
  const [body, setBody] = useState<string>("");

  const responseBodyForView = useMemo(() => {
    if (!response) return "";
    return maybePrettifyJson(response.body);
  }, [response]);

  // Keep requestField consistent with the active request tab to avoid
  // multiple inputs being active at once.
  useEffect(() => {
    if (requestTab === "headers") {
      if (requestField !== "headerKey" && requestField !== "headerValue") {
        focusSend({ type: "SET_REQUEST_FIELD", field: "headerKey" });
      }
    } else if (requestTab === "body") {
      if (requestField !== "contentType" && requestField !== "body") {
        focusSend({ type: "SET_REQUEST_FIELD", field: "contentType" });
      }
    }
  }, [requestTab, requestField, focusSend]);

  const request: FfiRequest = useMemo(
    () => ({
      method,
      url,
      headers: normalizeHeaders(headers),
      body:
        body.trim().length > 0
          ? {
              contentType,
              content: body,
            }
          : undefined,
    }),
    [method, url, headers, contentType, body]
  );

  async function send() {
    if (isLoading) return;

    const transitionKey = startTransition(
      "request",
      { type: "SEND_REQUEST" },
      requestState.context
    );

    try {
      // Prepare the request
      requestSend({ type: "PREPARE_REQUEST", request });

      // Send the request
      requestSend({ type: "SEND_REQUEST" });

      const res = await sendRequestViaRust(request);
      requestSend({ type: "REQUEST_SUCCESS", response: res });
      focusSend({ type: "SET_RESPONSE_TAB", tab: "body" });

      // Navigate to response tabs based on current state
      const currentState = focusState.value;
      if (currentState === "topbar") {
        // topbar -> requestTabs -> requestPane -> responseTabs
        focusSend({ type: "TAB_NEXT" });
        focusSend({ type: "TAB_NEXT" });
        focusSend({ type: "TAB_NEXT" });
      } else if (currentState === "requestTabs") {
        // requestTabs -> requestPane -> responseTabs
        focusSend({ type: "TAB_NEXT" });
        focusSend({ type: "TAB_NEXT" });
      } else if (currentState === "requestPane") {
        // requestPane -> responseTabs
        focusSend({ type: "TAB_NEXT" });
      }
      // If already on responseTabs, do nothing
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      requestSend({ type: "REQUEST_ERROR", error: errorMessage });

      // Enhanced error logging with full context
      logError(
        "request",
        e as Error,
        { type: "SEND_REQUEST" }, // event that caused the error
        {
          request,
          currentState: requestState.value,
          focusState: focusState.value,
        }, // context
        requestState.value // current state
      );
    }
  }

  const tabNext = () => {
    try {
      focusSend({ type: "TAB_NEXT" });
    } catch (error) {
      logError(
        "focus",
        error as Error,
        { type: "TAB_NEXT" },
        focusState.context,
        focusState.value
      );
    }
  };

  const tabPrev = () => {
    try {
      focusSend({ type: "TAB_PREV" });
    } catch (error) {
      logError(
        "focus",
        error as Error,
        { type: "TAB_PREV" },
        focusState.context,
        focusState.value
      );
    }
  };

  const toggleDebugPanel = () => {
    setDebugPanelVisible(!debugPanelVisible);
  };

  // In non-interactive environments (like CI), Ink can't enable raw mode.
  // Also, @inkjs/ui inputs require raw mode to work.
  if (!isRawModeSupported) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold>Pigeon (Ink + Bun + Rust FFI)</Text>
        <Text color="yellow">
          Interactive TUI requires a TTY (raw mode unsupported for this stdin).
        </Text>
        <Text dimColor>
          Run this from a real terminal: `cd tui && bun run dev`
        </Text>
      </Box>
    );
  }

  const requestTabs = [
    { id: "headers", label: "Headers" },
    { id: "body", label: "Body" },
    { id: "query", label: "Query" },
    { id: "auth", label: "Auth" },
    { id: "info", label: "Info" },
    { id: "options", label: "Options" },
  ] as const;

  const responseTabs = [
    { id: "body", label: "Body" },
    { id: "headers", label: "Headers" },
    { id: "trace", label: "Trace" },
  ] as const;

  const topbarFocused = focus === "topbar";
  const requestFocused = focus === "requestTabs" || focus === "requestPane";
  const responseFocused = focus === "responseTabs";

  const TopBar = (
    <Box
      flexDirection="row"
      gap={1}
      borderStyle="round"
      borderColor={topbarFocused ? theme.focusBorder : theme.borderIdle}
      paddingX={1}
      paddingY={0}
    >
      <Box flexDirection="column" width={10}>
        <Text dimColor>Method</Text>
        <MethodDropdown
          value={method}
          options={methodOptions}
          isActive={focus === "topbar" && topbarField === "method"}
          isDisabled={isLoading}
          onChange={(value) => setMethod(value)}
          onOpenChange={setMethodDropdownOpen}
          onHighlightChange={setMethodHighlightedIndex}
        />
      </Box>

      <Box flexDirection="column" flexGrow={1}>
        <Text dimColor>URL</Text>
        <TextInput
          isDisabled={focus !== "topbar" || topbarField !== "url" || isLoading}
          defaultValue={url}
          onChange={setUrl}
        />
      </Box>

      <Box flexDirection="column" width={26} alignItems="flex-end">
        <Text dimColor>Send</Text>
        {isLoading ? (
          <Spinner label="Sending..." />
        ) : response ? (
          <Text>
            <Text color={response.status < 400 ? "green" : "red"} bold>
              {response.status}
            </Text>{" "}
            <Text dimColor>{response.durationMs}ms</Text>
          </Text>
        ) : (
          <Text dimColor>Ready</Text>
        )}
      </Box>
    </Box>
  );

  const Sidebar = (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.borderIdle}
      paddingX={1}
      paddingY={0}
    >
      <Box justifyContent="space-between">
        <Text bold>Collection</Text>
        <Text dimColor>(placeholder)</Text>
      </Box>
      <Text dimColor>- sample-collections</Text>
      <Text>GET echo</Text>
      <Text dimColor>GET get random user</Text>
      <Text dimColor>POS echo post</Text>
    </Box>
  );

  const RequestPane = (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={requestFocused ? theme.focusBorder : theme.borderIdle}
      paddingX={1}
      paddingY={0}
      flexGrow={1}
    >
      <Box justifyContent="space-between">
        <Text bold>Request</Text>
        <Text dimColor>{formatHeaderPreview(headers)}</Text>
      </Box>
      <TabBar
        tabs={requestTabs as any}
        activeTab={requestTab}
        isActive={focus === "requestTabs"}
        onChange={(t) => focusSend({ type: "SET_REQUEST_TAB", tab: t })}
      />

      <Box marginTop={1} flexDirection="column">
        {requestTab === "headers" ? (
          <Box flexDirection="column" gap={1}>
            <Text dimColor>Header Key/Value (simple editor for now)</Text>
            <Box gap={1}>
              <Box flexDirection="column" flexGrow={1}>
                <Text dimColor>Key</Text>
                <TextInput
                  key={`header-key-${headerInputNonce}`}
                  isDisabled={
                    focus !== "requestPane" ||
                    requestTab !== "headers" ||
                    requestField !== "headerKey" ||
                    isLoading
                  }
                  placeholder="Content-Type"
                  onChange={setHeaderKey}
                  onSubmit={() =>
                    focusSend({
                      type: "SET_REQUEST_FIELD",
                      field: "headerValue",
                    })
                  }
                />
              </Box>
              <Box flexDirection="column" flexGrow={2}>
                <Text dimColor>Value</Text>
                <TextInput
                  key={`header-value-${headerInputNonce}`}
                  isDisabled={
                    focus !== "requestPane" ||
                    requestTab !== "headers" ||
                    requestField !== "headerValue" ||
                    isLoading
                  }
                  placeholder="application/json"
                  onChange={setHeaderValue}
                  onSubmit={() => {
                    const k = headerKey.trim();
                    if (k.length > 0) {
                      setHeaders((prev) => [
                        ...prev,
                        { key: k, value: headerValue, enabled: true },
                      ]);
                      setHeaderKey("");
                      setHeaderValue("");
                      setHeaderInputNonce((n) => n + 1);
                    }
                    focusSend({
                      type: "SET_REQUEST_FIELD",
                      field: "headerKey",
                    });
                  }}
                />
              </Box>
            </Box>

            <Box flexDirection="column" marginTop={1}>
              <Text dimColor>Current headers</Text>
              {normalizeHeaders(headers).length === 0 ? (
                <Text dimColor>There are no headers.</Text>
              ) : (
                normalizeHeaders(headers)
                  .slice(0, 8)
                  .map((h, i) => (
                    <Text key={`${h.key}-${i}`}>
                      {h.key}: {h.value}
                    </Text>
                  ))
              )}
            </Box>
          </Box>
        ) : requestTab === "body" ? (
          <Box flexDirection="column" gap={1}>
            <Box flexDirection="column">
              <Text dimColor>Content-Type</Text>
              <TextInput
                isDisabled={
                  focus !== "requestPane" ||
                  requestTab !== "body" ||
                  requestField !== "contentType" ||
                  isLoading
                }
                defaultValue={contentType}
                onChange={setContentType}
                onSubmit={() =>
                  focusSend({ type: "SET_REQUEST_FIELD", field: "body" })
                }
              />
            </Box>
            <TextArea
              title="Body"
              value={body}
              isActive={
                focus === "requestPane" &&
                requestTab === "body" &&
                requestField === "body"
              }
              height={10}
              onChange={setBody}
            />
          </Box>
        ) : (
          <Text dimColor>Not implemented yet.</Text>
        )}
      </Box>
    </Box>
  );

  const ResponsePane = (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={responseFocused ? theme.focusBorder : theme.borderIdle}
      paddingX={1}
      paddingY={0}
      flexGrow={1}
    >
      <Box justifyContent="space-between">
        <Text bold>Response</Text>
        {response ? (
          <Text dimColor>
            {response.status} · {response.durationMs}ms
          </Text>
        ) : (
          <Text dimColor>—</Text>
        )}
      </Box>

      <TabBar
        tabs={responseTabs as any}
        activeTab={responseTab}
        isActive={focus === "responseTabs"}
        onChange={(t) => focusSend({ type: "SET_RESPONSE_TAB", tab: t })}
      />

      <Box marginTop={1} flexDirection="column">
        {!response ? (
          <Text dimColor>No response yet. Press ctrl+j to send.</Text>
        ) : responseTab === "headers" ? (
          <TextArea
            title="Headers"
            value={response.headers
              .map(([k, v]: [string, string]) => `${k}: ${v}`)
              .join("\n")}
            isActive={focus === "responseTabs"}
            height={10}
            readOnly
          />
        ) : responseTab === "trace" ? (
          <TextArea
            title="Trace"
            value={
              "(placeholder)\n\nWe can add timing breakdown / redirects / DNS / TLS, etc."
            }
            isActive={focus === "responseTabs"}
            height={10}
            readOnly
          />
        ) : (
          <Box flexDirection="column" gap={1}>
            <TextArea
              title="Body"
              value={responseBodyForView}
              isActive={focus === "responseTabs"}
              height={10}
              readOnly
            />
          </Box>
        )}
      </Box>
    </Box>
  );

  const RightPane = (
    <VSplit
      top={RequestPane}
      bottom={ResponsePane}
      topFlex={2}
      bottomFlex={2}
      gap={1}
    />
  );

  return (
    <Box flexDirection="column" padding={1} width="100%" position="relative">
      <KeyboardShortcuts
        onExit={quit}
        onSend={() => {
          void send();
        }}
        onTab={tabNext}
        onTabPrev={tabPrev}
        onFocusMethod={() => {
          try {
            focusSend({ type: "FOCUS_METHOD" });
          } catch (error) {
            logError(
              "focus",
              error as Error,
              { type: "FOCUS_METHOD" },
              focusState.context,
              focusState.value
            );
          }
        }}
        onFocusUrl={() => {
          try {
            focusSend({ type: "FOCUS_URL" });
          } catch (error) {
            logError(
              "focus",
              error as Error,
              { type: "FOCUS_URL" },
              focusState.context,
              focusState.value
            );
          }
        }}
        onToggleDebug={toggleDebugPanel}
        onClearDebugLogs={clearLogs}
        canHandleGlobalShortcut={canHandleGlobalShortcut}
      />

      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold>Posting-like Pigeon</Text>
        <Text dimColor>Focus: {focus}</Text>
      </Box>

      {error ? <StatusMessage variant="error">{error}</StatusMessage> : null}

      <Box flexDirection="column" gap={1} width="100%" position="relative">
        {TopBar}

        <HSplit left={Sidebar} right={RightPane} leftWidth={32} gap={1} />

        {debugPanelVisible && <DebugPanel isVisible={debugPanelVisible} />}

        <Box borderStyle="round" paddingX={1} paddingY={0}>
          <KeyHints
            items={[
              { key: "^j", label: "Send" },
              { key: "^t", label: "Method" },
              { key: "^l", label: "URL" },
              { key: "tab", label: "Focus next" },
              { key: "shift+tab", label: "Focus prev" },
              { key: "←/→", label: "Switch tab" },
              { key: "d", label: "Debug" },
              { key: "^i", label: "Clear logs" },
              { key: "q", label: "Quit" },
            ]}
          />
        </Box>
      </Box>

      {/* Method dropdown overlay - rendered at app level to ensure proper layering */}
      {/* Positioned absolutely to float above all content */}
      {/* Rendered last to ensure it appears on top */}
      {methodDropdownOpen && focus === "topbar" && topbarField === "method" && (
        <MethodDropdownMenu
          isOpen={methodDropdownOpen}
          value={method}
          options={methodOptions}
          highlightedIndex={methodHighlightedIndex}
          onSelect={(value) => setMethod(value)}
          top={4} // Position below the topbar (1 padding + 1 title + 1 topbar + 1 gap)
          left={3} // Align with Method selector (1 padding + 1 border + 1 for alignment)
        />
      )}
    </Box>
  );
}
