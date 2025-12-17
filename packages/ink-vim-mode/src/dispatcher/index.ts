// Input dispatching system for routing keyboard events

import type { VimCommand } from "../types";

export class InputDispatcher {
  // TODO: Implement InputDispatcher
  process(input: string, key: any): VimCommand | null {
    throw new Error("InputDispatcher not yet implemented");
  }
}
