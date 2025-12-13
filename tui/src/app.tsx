import React, { useEffect, useMemo, useState } from "react";
import { Box, Text, useApp, useInput, useStdin } from "ink";
import { Select, Spinner, StatusMessage, TextInput } from "@inkjs/ui";
import type {
  FfiRequest,
  FfiResponse,
  HttpMethod,
  RequestHeader,
} from "@/types";
import { sendRequestViaRust } from "@/ffi/client";
import { terminateRustWorker } from "@/ffi/client";
import { HSplit, VSplit } from "@/ui/SplitPane";
import { TabBar } from "@/ui/TabBar";
import { KeyHints } from "@/ui/KeyHints";
import { TextArea } from "@/ui/TextArea";

type FocusTarget = "topbar" | "requestTabs" | "requestPane" | "responseTabs";
type TopbarField = "method" | "url";
type RequestField = "headerKey" | "headerValue" | "contentType" | "body";

type RequestTab = "headers" | "body" | "query" | "auth" | "info" | "options";
type ResponseTab = "body" | "headers" | "trace";

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
  onFocusMethod?: () => void;
  onFocusUrl?: () => void;
  canQuit?: () => boolean;
}) {
  useInput((input, key) => {
    // Avoid quitting while the user is typing (e.g. URL contains 'q').
    if (input === "q" && (props.canQuit?.() ?? true)) {
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

    if (key.tab) {
      props.onTab();
    }

    // Posting-like quick focus
    if (key.ctrl && input === "t") {
      props.onFocusMethod?.();
    }

    if (key.ctrl && input === "l") {
      props.onFocusUrl?.();
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

  const [focus, setFocus] = useState<FocusTarget>("topbar");
  const [topbarField, setTopbarField] = useState<TopbarField>("url");
  const [requestTab, setRequestTab] = useState<RequestTab>("headers");
  const [responseTab, setResponseTab] = useState<ResponseTab>("body");
  const [requestField, setRequestField] = useState<RequestField>("headerKey");

  const canQuit = () => {
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

  const [headerKey, setHeaderKey] = useState<string>("");
  const [headerValue, setHeaderValue] = useState<string>("");
  const [headers, setHeaders] = useState<RequestHeader[]>([]);
  const [headerInputNonce, setHeaderInputNonce] = useState(0);

  const [contentType, setContentType] = useState<string>("application/json");
  const [body, setBody] = useState<string>("");

  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<FfiResponse | null>(null);

  const responseBodyForView = useMemo(() => {
    if (!response) return "";
    return maybePrettifyJson(response.body);
  }, [response]);

  // Keep requestField consistent with the active request tab to avoid
  // multiple inputs being active at once.
  useEffect(() => {
    if (requestTab === "headers") {
      if (requestField !== "headerKey" && requestField !== "headerValue") {
        setRequestField("headerKey");
      }
    } else if (requestTab === "body") {
      if (requestField !== "contentType" && requestField !== "body") {
        setRequestField("contentType");
      }
    }
  }, [requestTab, requestField]);

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
    if (isSending) return;
    setIsSending(true);
    setError(null);
    try {
      const res = await sendRequestViaRust(request);
      setResponse(res);
      setResponseTab("body");
      setFocus("responseTabs");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsSending(false);
    }
  }

  const tabNext = () => {
    // Special-case: topbar contains 2 focusable controls.
    if (focus === "topbar") {
      if (topbarField === "method") setTopbarField("url");
      else setFocus("requestTabs");
      return;
    }

    const order: FocusTarget[] = [
      "topbar",
      "requestTabs",
      "requestPane",
      "responseTabs",
    ];
    const idx = Math.max(0, order.indexOf(focus));
    const next = order[(idx + 1) % order.length] ?? "topbar";
    setFocus(next);
    if (next === "topbar") setTopbarField("url");
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

  const TopBar = (
    <Box
      flexDirection="row"
      gap={1}
      borderStyle="round"
      paddingX={1}
      paddingY={0}
    >
      <Box flexDirection="column" width={10}>
        <Text dimColor>Method</Text>
        <Select
          isDisabled={
            focus !== "topbar" || topbarField !== "method" || isSending
          }
          options={methodOptions}
          defaultValue={method}
          onChange={(value) => setMethod(value as HttpMethod)}
        />
      </Box>

      <Box flexDirection="column" flexGrow={1}>
        <Text dimColor>URL</Text>
        <TextInput
          isDisabled={focus !== "topbar" || topbarField !== "url" || isSending}
          defaultValue={url}
          onChange={setUrl}
        />
      </Box>

      <Box flexDirection="column" width={26} alignItems="flex-end">
        <Text dimColor>Send</Text>
        {isSending ? (
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
    <Box flexDirection="column" borderStyle="round" paddingX={1} paddingY={0}>
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
        onChange={(t) => setRequestTab(t)}
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
                    isSending
                  }
                  placeholder="Content-Type"
                  onChange={setHeaderKey}
                  onSubmit={() => setRequestField("headerValue")}
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
                    isSending
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
                    setRequestField("headerKey");
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
                  isSending
                }
                defaultValue={contentType}
                onChange={setContentType}
                onSubmit={() => setRequestField("body")}
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
        onChange={(t) => setResponseTab(t)}
      />

      <Box marginTop={1} flexDirection="column">
        {!response ? (
          <Text dimColor>No response yet. Press ctrl+j to send.</Text>
        ) : responseTab === "headers" ? (
          <TextArea
            title="Headers"
            value={response.headers.map(([k, v]) => `${k}: ${v}`).join("\n")}
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
    <Box flexDirection="column" padding={1} width="100%">
      <KeyboardShortcuts
        onExit={quit}
        onSend={() => {
          void send();
        }}
        onTab={tabNext}
        onFocusMethod={() => {
          setFocus("topbar");
          setTopbarField("method");
        }}
        onFocusUrl={() => {
          setFocus("topbar");
          setTopbarField("url");
        }}
        canQuit={canQuit}
      />

      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold>Posting-like Pigeon</Text>
        <Text dimColor>Focus: {focus}</Text>
      </Box>

      {error ? <StatusMessage variant="error">{error}</StatusMessage> : null}

      <Box flexDirection="column" gap={1} width="100%">
        {TopBar}

        <HSplit left={Sidebar} right={RightPane} leftWidth={32} gap={1} />

        <Box borderStyle="round" paddingX={1} paddingY={0}>
          <KeyHints
            items={[
              { key: "^j", label: "Send" },
              { key: "^t", label: "Method" },
              { key: "^l", label: "URL" },
              { key: "tab", label: "Focus next" },
              { key: "←/→", label: "Switch tab" },
              { key: "q", label: "Quit" },
            ]}
          />
        </Box>
      </Box>
    </Box>
  );
}
