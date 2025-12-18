// Key sequence -> VimCommand parser
// Pure helpers that translate single-key inputs plus current context
// into high-level VimCommand objects.

import type { VimCommand, VimMode } from "../types";

export interface ParseContext {
  /**
   * Numeric count derived from the state's commandBuffer.
   * 0 or undefined means "no explicit count" (treat as 1).
   */
  count: number;
  /**
   * Pending operator from previous key presses, e.g. the first "d" in "dd".
   */
  pendingOperator: string | null;
}

export interface ParseResult {
  command: VimCommand | null;
  /**
   * Updated pending operator to carry over between key presses.
   */
  nextPendingOperator: string | null;
  /**
   * Whether the numeric count buffer should be cleared after this key.
   */
  clearCountBuffer: boolean;
}

function normalizeCount(count: number): number {
  return count && count > 0 ? count : 1;
}

/**
 * Parse a single key input in NORMAL/VISUAL modes into a high-level VimCommand.
 * This parser is intentionally minimal and only understands a small subset
 * of motions/actions used by the demo TUI editor:
 *
 * - hjkl           -> MOTION (cursor movement inside component)
 * - x              -> ACTION DeleteChar (like Vim's `x`)
 * - [count]dd      -> ACTION DeleteLine (like Vim's `dd`, with optional count)
 */
export function parseKeyToCommand(
  input: string,
  mode: VimMode,
  context: ParseContext
): ParseResult {
  // INSERT / COMMAND are handled elsewhere; we should never be called for them.
  if (mode === "INSERT" || mode === "COMMAND") {
    return {
      command: null,
      nextPendingOperator: context.pendingOperator,
      clearCountBuffer: false,
    };
  }

  const count = normalizeCount(context.count);

  // Handle motion keys (hjkl) in NORMAL/VISUAL
  if (input === "h" || input === "j" || input === "k" || input === "l") {
    return {
      command: {
        type: "MOTION",
        command: input,
        // Consumers that care about direction will narrow to MotionCommand
        // via type guard and read this field.
        // @ts-expect-error - direction field is part of MotionCommand subtype
        direction: input,
        count,
      },
      nextPendingOperator: null,
      clearCountBuffer: true,
    };
  }

  // Handle delete char: `x` (uses count prefix if present)
  if (input === "x") {
    return {
      command: {
        type: "ACTION",
        command: "DELETE_CHAR",
        count,
      },
      nextPendingOperator: null,
      clearCountBuffer: true,
    };
  }

  // Handle `dd` / `3dd` style delete-line operator
  if (input === "d") {
    // First `d` – remember operator and wait for the second key.
    if (context.pendingOperator == null) {
      return {
        command: null,
        nextPendingOperator: "d",
        clearCountBuffer: false,
      };
    }

    // Second `d` – execute delete-line with current count.
    if (context.pendingOperator === "d") {
      return {
        command: {
          type: "ACTION",
          command: "DELETE_LINE",
          count,
        },
        nextPendingOperator: null,
        clearCountBuffer: true,
      };
    }
  }

  // Any other key clears the pending operator but does not produce a command.
  return {
    command: null,
    nextPendingOperator: null,
    clearCountBuffer: false,
  };
}
