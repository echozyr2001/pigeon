import { dlopen, FFIType, CString, suffix } from "bun:ffi";
import { fileURLToPath } from "url";

export type RustLib = {
  sendRequestPtr: (reqJsonPtr: Buffer) => number;
  freeString: (ptr: number) => void;
};

export function loadRustLib(): RustLib {
  const libPath = fileURLToPath(
    new URL(`../../../target/release/libpigeon.${suffix}`, import.meta.url)
  );

  const lib = dlopen(libPath, {
    pigeon_send_request: {
      args: [FFIType.cstring],
      returns: FFIType.ptr,
    },
    pigeon_free_string: {
      args: [FFIType.ptr],
      returns: FFIType.void,
    },
  });

  return {
    sendRequestPtr: (reqJsonBuf: Buffer) => {
      const ptr = lib.symbols.pigeon_send_request(reqJsonBuf);
      // Bun returns null for 0 pointers
      return (ptr as unknown as number) ?? 0;
    },
    freeString: (ptr: number) => {
      lib.symbols.pigeon_free_string(ptr);
    },
  };
}

export function readCStringAndFree(
  ptr: number,
  free: (p: number) => void
): string {
  if (!ptr) return "";
  const s = new CString(ptr);
  free(ptr);
  return s.toString();
}
