import { CString, type Pointer } from "bun:ffi";
import { getCoreLib } from "./core";

export type RustLib = {
  sendRequestPtr: (reqJsonPtr: Buffer) => Pointer | null;
  freeString: (ptr: Pointer) => void;
};

export function loadRustLib(): RustLib {
  const core = getCoreLib();

  return {
    sendRequestPtr: (reqJsonBuf: Buffer) => {
      return core.pigeon_send_request(reqJsonBuf);
    },
    freeString: (ptr: Pointer) => {
      core.pigeon_free_string(ptr);
    },
  };
}

export function readCStringAndFree(
  ptr: Pointer | null,
  free: (p: Pointer) => void
): string {
  if (!ptr) return "";
  const s = new CString(ptr);
  free(ptr);
  return s.toString();
}
