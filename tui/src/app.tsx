import React, { useMemo, useState } from "react";
import { Box, Text, useApp, useInput, useStdin } from "ink";
import { Select, Spinner, StatusMessage, TextInput } from "@inkjs/ui";
import type {
  FfiRequest,
  FfiResponse,
  HttpMethod,
  RequestHeader,
} from "@/types";
import { sendRequestViaRust } from "@/ffi/client";

type ActiveField =
  | "method"
  | "url"
  | "headerKey"
  | "headerValue"
  | "contentType"
  | "body"
  | "none";

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
}) {
  useInput((input, key) => {
    if (input === "q") {
      props.onExit();
      return;
    }

    if (key.ctrl && input === "c") {
      props.onExit();
      return;
    }

    // Many terminals encode Ctrl+J as LF (\n) instead of reporting ctrl+j.
    // We treat LF as the "send-request" binding (Posting default).
    if (input === "\n") {
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

export function App() {
  const { exit } = useApp();
  const { isRawModeSupported } = useStdin();

  const [activeField, setActiveField] = useState<ActiveField>("url");

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
      setActiveField("none");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsSending(false);
    }
  }

  const tabNext = () => {
    const order: ActiveField[] = [
      "method",
      "url",
      "headerKey",
      "headerValue",
      "contentType",
      "body",
    ];
    const idx = Math.max(0, order.indexOf(activeField));
    setActiveField(order[(idx + 1) % order.length] ?? "url");
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

  return (
    <Box flexDirection="column" gap={1} padding={1}>
      {isRawModeSupported ? (
        <KeyboardShortcuts
          onExit={exit}
          onSend={() => {
            void send();
          }}
          onTab={tabNext}
        />
      ) : null}

      <Box justifyContent="space-between">
        <Text bold>Pigeon (Ink + Bun + Rust FFI)</Text>
        <Text dimColor>
          Send: ^j (ctrl+j) · Quit: q / ^c · Next: tab
          {isRawModeSupported ? "" : " · (input disabled: no raw mode)"}
        </Text>
      </Box>

      {error ? <StatusMessage variant="error">{error}</StatusMessage> : null}

      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          <Text dimColor>Method</Text>
          <Select
            isDisabled={activeField !== "method" || isSending}
            options={methodOptions}
            defaultValue={method}
            onChange={(value) => setMethod(value as HttpMethod)}
          />
        </Box>

        <Box flexDirection="column">
          <Text dimColor>URL</Text>
          <TextInput
            isDisabled={activeField !== "url" || isSending}
            defaultValue={url}
            onChange={setUrl}
            onSubmit={() => setActiveField("headerKey")}
          />
        </Box>

        <Box flexDirection="column">
          <Text dimColor>Header (press Enter on value to add)</Text>
          <Box gap={1}>
            <Box flexDirection="column" flexGrow={1}>
              <Text dimColor>Key</Text>
              <TextInput
                key={`header-key-${headerInputNonce}`}
                isDisabled={activeField !== "headerKey" || isSending}
                placeholder="Authorization"
                onChange={setHeaderKey}
                onSubmit={() => setActiveField("headerValue")}
              />
            </Box>
            <Box flexDirection="column" flexGrow={2}>
              <Text dimColor>Value</Text>
              <TextInput
                key={`header-value-${headerInputNonce}`}
                isDisabled={activeField !== "headerValue" || isSending}
                placeholder="Bearer ..."
                onChange={setHeaderValue}
                onSubmit={() => {
                  const k = headerKey.trim();
                  if (k.length > 0) {
                    setHeaders((prev) => [
                      ...prev,
                      { key: k, value: headerValue, enabled: true },
                    ]);
                    // TextInput is uncontrolled, so remount to clear.
                    setHeaderKey("");
                    setHeaderValue("");
                    setHeaderInputNonce((n) => n + 1);
                  }
                  setActiveField("contentType");
                }}
              />
            </Box>
          </Box>
          <Text dimColor>Current: {formatHeaderPreview(headers)}</Text>
        </Box>

        <Box flexDirection="column">
          <Text dimColor>Content-Type</Text>
          <TextInput
            isDisabled={activeField !== "contentType" || isSending}
            defaultValue={contentType}
            onChange={setContentType}
            onSubmit={() => setActiveField("body")}
          />
        </Box>

        <Box flexDirection="column">
          <Text dimColor>Body (single line for now)</Text>
          <TextInput
            isDisabled={activeField !== "body" || isSending}
            placeholder={'{"hello":"world"}'}
            onChange={setBody}
            onSubmit={() => setActiveField("none")}
          />
        </Box>
      </Box>

      <Box>
        {isSending ? (
          <Spinner label="Sending request via Rust..." />
        ) : (
          <Text>Ready.</Text>
        )}
      </Box>

      <Box flexDirection="column" borderStyle="round" paddingX={1} paddingY={0}>
        <Text bold>Response</Text>
        {response ? (
          <>
            <Text>
              Status: {response.status} {response.statusText} ·{" "}
              {response.durationMs}ms
            </Text>
            <Text dimColor>Headers: {response.headers.length}</Text>
            {response.headers.slice(0, 8).map(([k, v], i) => (
              <Text key={`${k}-${i}`}>
                {k}: {v}
              </Text>
            ))}
            <Text dimColor>Body:</Text>
            <Text>{response.body.slice(0, 1000)}</Text>
          </>
        ) : (
          <Text dimColor>No response yet. Press ctrl+j to send.</Text>
        )}
      </Box>
    </Box>
  );
}
