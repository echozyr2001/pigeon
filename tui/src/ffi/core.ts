import { dlopen, FFIType, suffix, type Pointer } from "bun:ffi";
import { fileURLToPath } from "url";

export type CoreLibSymbols = {
  pigeon_send_request: (buf: Buffer) => Pointer | null;
  pigeon_load_config: () => Pointer | null;
  pigeon_free_string: (ptr: Pointer) => void;
};

let coreLib: CoreLibSymbols | null = null;

export function getCoreLib(): CoreLibSymbols {
  if (coreLib) return coreLib;

  const libPath = fileURLToPath(
    new URL(`../../../target/release/libpigeon.${suffix}`, import.meta.url)
  );

  const lib = dlopen(libPath, {
    pigeon_send_request: {
      args: [FFIType.cstring],
      returns: FFIType.ptr,
    },
    pigeon_load_config: {
      args: [],
      returns: FFIType.ptr,
    },
    pigeon_free_string: {
      args: [FFIType.ptr],
      returns: FFIType.void,
    },
  });

  coreLib = {
    pigeon_send_request: lib.symbols.pigeon_send_request,
    pigeon_load_config: lib.symbols.pigeon_load_config,
    pigeon_free_string: lib.symbols.pigeon_free_string,
  };

  return coreLib;
}
