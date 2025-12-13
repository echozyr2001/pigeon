import React, { useEffect, useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function splitLines(s: string): string[] {
  // Preserve trailing empty line if user ends with newline
  const parts = s.split("\n");
  return parts;
}

function indexToLineCol(
  s: string,
  index: number
): { line: number; col: number } {
  const lines = splitLines(s);
  let remaining = index;
  for (let i = 0; i < lines.length; i++) {
    const len = lines[i]!.length;
    if (remaining <= len) return { line: i, col: remaining };
    remaining -= len + 1; // +\n
  }
  // Past end
  const last = Math.max(0, lines.length - 1);
  return { line: last, col: lines[last]!.length };
}

function lineColToIndex(s: string, line: number, col: number): number {
  const lines = splitLines(s);
  const l = clamp(line, 0, Math.max(0, lines.length - 1));
  const c = clamp(col, 0, lines[l]!.length);
  let idx = 0;
  for (let i = 0; i < l; i++) idx += lines[i]!.length + 1;
  idx += c;
  return idx;
}

function insertAt(
  s: string,
  idx: number,
  text: string
): { next: string; nextIdx: number } {
  const i = clamp(idx, 0, s.length);
  const next = s.slice(0, i) + text + s.slice(i);
  return { next, nextIdx: i + text.length };
}

function deleteBefore(
  s: string,
  idx: number
): { next: string; nextIdx: number } {
  if (idx <= 0) return { next: s, nextIdx: 0 };
  const i = clamp(idx, 0, s.length);
  const next = s.slice(0, i - 1) + s.slice(i);
  return { next, nextIdx: i - 1 };
}

function deleteAt(s: string, idx: number): { next: string; nextIdx: number } {
  if (idx >= s.length) return { next: s, nextIdx: s.length };
  const i = clamp(idx, 0, s.length);
  const next = s.slice(0, i) + s.slice(i + 1);
  return { next, nextIdx: i };
}

export function TextArea(props: {
  title: string;
  value: string;
  onChange?: (next: string) => void;
  height: number;
  isActive: boolean;
  readOnly?: boolean;
}) {
  const readOnly = props.readOnly ?? false;

  // Two modes: view vs edit (Posting-like).
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(props.value);
  const [cursor, setCursor] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);

  // Keep draft in sync when not editing
  useEffect(() => {
    if (!isEditing) {
      setDraft(props.value);
      setCursor(clamp(cursor, 0, props.value.length));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.value, isEditing]);

  const lines = useMemo(
    () => splitLines(isEditing ? draft : props.value),
    [draft, props.value, isEditing]
  );

  const viewportHeight = Math.max(1, props.height - 2);

  const ensureCursorVisible = (nextCursor: number, nextDraft: string) => {
    const { line } = indexToLineCol(nextDraft, nextCursor);
    const top = scrollTop;
    const bottom = top + viewportHeight - 1;
    if (line < top) setScrollTop(line);
    else if (line > bottom)
      setScrollTop(Math.max(0, line - viewportHeight + 1));
  };

  useInput(
    (input, key) => {
      if (!props.isActive) return;

      // Toggle edit mode
      if (!readOnly && !isEditing && input === "e") {
        setIsEditing(true);
        setDraft(props.value);
        setCursor(clamp(cursor, 0, props.value.length));
        return;
      }

      if (isEditing) {
        // Apply / cancel
        if (key.ctrl && input === "s") {
          setIsEditing(false);
          props.onChange?.(draft);
          return;
        }
        if (key.escape) {
          setIsEditing(false);
          setDraft(props.value);
          return;
        }

        // Navigation
        if (key.leftArrow) {
          const next = clamp(cursor - 1, 0, draft.length);
          setCursor(next);
          ensureCursorVisible(next, draft);
          return;
        }
        if (key.rightArrow) {
          const next = clamp(cursor + 1, 0, draft.length);
          setCursor(next);
          ensureCursorVisible(next, draft);
          return;
        }
        if (key.upArrow || key.downArrow) {
          const { line, col } = indexToLineCol(draft, cursor);
          const targetLine = clamp(
            line + (key.upArrow ? -1 : 1),
            0,
            Math.max(0, lines.length - 1)
          );
          const idx = lineColToIndex(draft, targetLine, col);
          setCursor(idx);
          ensureCursorVisible(idx, draft);
          return;
        }
        if (key.pageUp || key.pageDown) {
          const delta = key.pageUp ? -viewportHeight : viewportHeight;
          setScrollTop((t) =>
            clamp(t + delta, 0, Math.max(0, lines.length - viewportHeight))
          );
          return;
        }

        // Editing primitives
        if (key.backspace) {
          const { next, nextIdx } = deleteBefore(draft, cursor);
          setDraft(next);
          setCursor(nextIdx);
          ensureCursorVisible(nextIdx, next);
          return;
        }
        if (key.delete) {
          const { next, nextIdx } = deleteAt(draft, cursor);
          setDraft(next);
          setCursor(nextIdx);
          ensureCursorVisible(nextIdx, next);
          return;
        }
        if (key.return) {
          const { next, nextIdx } = insertAt(draft, cursor, "\n");
          setDraft(next);
          setCursor(nextIdx);
          ensureCursorVisible(nextIdx, next);
          return;
        }

        // Insert printable characters (ignore control sequences)
        if (input && !key.ctrl && !key.meta && !key.escape && input !== "\n") {
          const { next, nextIdx } = insertAt(draft, cursor, input);
          setDraft(next);
          setCursor(nextIdx);
          ensureCursorVisible(nextIdx, next);
        }

        return;
      }

      // View mode (read-only scrolling)
      if (key.upArrow) {
        setScrollTop((t) =>
          clamp(t - 1, 0, Math.max(0, lines.length - viewportHeight))
        );
      } else if (key.downArrow) {
        setScrollTop((t) =>
          clamp(t + 1, 0, Math.max(0, lines.length - viewportHeight))
        );
      } else if (key.pageUp) {
        setScrollTop((t) =>
          clamp(
            t - viewportHeight,
            0,
            Math.max(0, lines.length - viewportHeight)
          )
        );
      } else if (key.pageDown) {
        setScrollTop((t) =>
          clamp(
            t + viewportHeight,
            0,
            Math.max(0, lines.length - viewportHeight)
          )
        );
      } else if (!readOnly && input === "e") {
        setIsEditing(true);
        setDraft(props.value);
      }
    },
    { isActive: props.isActive }
  );

  const displayed = lines.slice(scrollTop, scrollTop + viewportHeight);
  const headerRight = readOnly
    ? "read-only"
    : isEditing
    ? "editing (ctrl+s apply, esc cancel)"
    : "view (press e to edit)";

  // Cursor rendering: show a block at cursor position on the active line.
  const cursorPos = isEditing
    ? indexToLineCol(draft, cursor)
    : { line: -1, col: -1 };

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      paddingX={1}
      paddingY={0}
      height={props.height}
    >
      <Box justifyContent="space-between">
        <Text bold>{props.title}</Text>
        <Text dimColor>
          {headerRight}
          {props.isActive ? "" : ""}
        </Text>
      </Box>

      <Box flexDirection="column">
        {displayed.map((line, i) => {
          const lineIndex = scrollTop + i;
          const isCursorLine = isEditing && lineIndex === cursorPos.line;

          if (!isCursorLine) {
            return (
              <Text key={`l-${lineIndex}`} wrap="truncate-end">
                <Text dimColor>{String(lineIndex + 1).padStart(3, " ")} </Text>
                {line.length === 0 ? <Text dimColor>·</Text> : line}
              </Text>
            );
          }

          const col = clamp(cursorPos.col, 0, line.length);
          const before = line.slice(0, col);
          const ch = col < line.length ? line[col] : " ";
          const after = col < line.length ? line.slice(col + 1) : "";

          return (
            <Text key={`l-${lineIndex}`} wrap="truncate-end">
              <Text dimColor>{String(lineIndex + 1).padStart(3, " ")} </Text>
              {before}
              <Text inverse>{ch}</Text>
              {after}
            </Text>
          );
        })}
      </Box>

      <Box justifyContent="space-between">
        <Text dimColor>
          {scrollTop + 1}:{Math.max(1, displayed.length)}
        </Text>
        <Text dimColor>
          {Math.min(
            lines.join("\n").length,
            isEditing ? draft.length : props.value.length
          )}{" "}
          chars
        </Text>
      </Box>
    </Box>
  );
}
