import { type Pointer } from "bun:ffi";
import { getCoreLib } from "./core";
import { readCStringAndFree } from "./bindings";

export type ConfigLib = {
  loadConfigPtr: () => Pointer | null;
  freeString: (ptr: Pointer) => void;
};

let configLib: ConfigLib | null = null;

export function loadConfigLib(): ConfigLib {
  if (configLib) return configLib;

  configLib = {
    loadConfigPtr: () => {
      const core = getCoreLib();
      return core.pigeon_load_config();
    },
    freeString: (ptr: Pointer) => {
      const core = getCoreLib();
      core.pigeon_free_string(ptr);
    },
  };

  return configLib;
}

export function loadConfig(): { error?: string } {
  const lib = loadConfigLib();
  const ptr = lib.loadConfigPtr();
  const result = readCStringAndFree(ptr, lib.freeString);

  // Handle empty or null responses
  if (!result || result.trim() === "" || result.trim() === "null") {
    return {};
  }

  try {
    const parsed = JSON.parse(result);
    if (parsed && typeof parsed === "object" && parsed.error) {
      return { error: parsed.error };
    }
    // Success case: parsed.success === true or empty object
    return {};
  } catch (e) {
    console.error("[Config] Failed to parse config response:", result, e);
    return { error: `Failed to parse config response: ${result}` };
  }
}
