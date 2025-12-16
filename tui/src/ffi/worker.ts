import type { FfiRequest, FfiResponse } from "@/types";
import { loadRustLib, readCStringAndFree } from "./bindings";

// `self` is the worker global in this module context.
declare const self: any;

type SendMessage = { type: "send"; id: number; request: FfiRequest };

type ResultMessage =
  | { type: "result"; id: number; ok: true; response: FfiResponse }
  | { type: "result"; id: number; ok: false; error: string };

const lib = loadRustLib();

function toRequestJson(req: FfiRequest): string {
  return JSON.stringify({
    method: req.method,
    url: req.url,
    headers: req.headers ?? [],
    body: req.body
      ? {
          contentType: req.body.contentType ?? "",
          content: req.body.content ?? "",
        }
      : undefined,
  });
}

self.onmessage = (event: MessageEvent<SendMessage>) => {
  const msg = event.data;
  if (!msg || msg.type !== "send") return;

  try {
    const json = toRequestJson(msg.request);
    const buf = Buffer.from(json + "\0", "utf8");

    const ptr = lib.sendRequestPtr(buf);
    const out = readCStringAndFree(ptr, lib.freeString);

    const parsed = JSON.parse(out) as unknown;
    // Minimal runtime validation
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !("status" in parsed) ||
      !("statusText" in parsed) ||
      !("headers" in parsed) ||
      !("body" in parsed) ||
      !("durationMs" in parsed)
    ) {
      throw new Error("Invalid response payload from Rust");
    }

    const response = parsed as FfiResponse;
    const result: ResultMessage = {
      type: "result",
      id: msg.id,
      ok: true,
      response,
    };
    self.postMessage(result);
  } catch (e) {
    const result: ResultMessage = {
      type: "result",
      id: msg.id,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
    self.postMessage(result);
  }
};
