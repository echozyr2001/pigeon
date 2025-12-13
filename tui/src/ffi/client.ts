import type { FfiRequest, FfiResponse } from "@/types";

type WorkerSendMessage = { type: "send"; id: number; request: FfiRequest };
type WorkerResultMessage =
  | { type: "result"; id: number; ok: true; response: FfiResponse }
  | { type: "result"; id: number; ok: false; error: string };

let worker: Worker | null = null;
let nextId = 1;
const inflight = new Map<
  number,
  { resolve: (r: FfiResponse) => void; reject: (e: Error) => void }
>();

export function terminateRustWorker(reason = "terminated"): void {
  if (!worker) return;
  // Reject all inflight requests so callers don't hang.
  for (const [id, pending] of inflight) {
    pending.reject(new Error(`Worker ${reason} (request ${id})`));
  }
  inflight.clear();

  worker.terminate();
  worker = null;
}

function getWorker(): Worker {
  if (worker) return worker;

  worker = new Worker(new URL("./worker.ts", import.meta.url), {
    type: "module",
  });

  worker.addEventListener(
    "message",
    (event: MessageEvent<WorkerResultMessage>) => {
      const msg = event.data;
      if (!msg || msg.type !== "result") return;

      const pending = inflight.get(msg.id);
      if (!pending) return;
      inflight.delete(msg.id);

      if (msg.ok) pending.resolve(msg.response);
      else pending.reject(new Error(msg.error));
    }
  );

  worker.addEventListener("error", (event) => {
    const err =
      event instanceof ErrorEvent ? event.error ?? event.message : event;
    for (const [id, pending] of inflight) {
      pending.reject(
        new Error(`Worker error for request ${id}: ${String(err)}`)
      );
    }
    inflight.clear();
  });

  return worker;
}

export async function sendRequestViaRust(
  req: FfiRequest
): Promise<FfiResponse> {
  const w = getWorker();
  const id = nextId++;

  const msg: WorkerSendMessage = { type: "send", id, request: req };

  return await new Promise<FfiResponse>((resolve, reject) => {
    inflight.set(id, { resolve, reject });
    w.postMessage(msg);
  });
}
