// StatusLine component for displaying Vim mode and status

import { Box, Text, useInput } from "ink";
import { useVimMode } from "../hooks";
import { useVimContext } from "../context/VimProvider";
import { StatusLineProps, VimMode } from "../types";

export function StatusLine({
  position = "bottom",
  showMode = true,
  showCommandBuffer = true,
  showMessage = true,
  customModeNames,
  style,
}: StatusLineProps = {}) {
  const { mode, commandBuffer, statusMessage, commandInput, send } =
    useVimMode();
  const { inputDispatcher } = useVimContext();

  // Always handle input to keep the app alive and process Vim commands
  useInput((input, key) => {
    // First, let the Vim dispatcher process the input
    const handled = inputDispatcher.process(input, key);

    // If Vim didn't handle it and we're in COMMAND mode, handle command input
    if (!handled && mode === "COMMAND") {
      if (key.return) {
        // Execute command on Enter
        if (commandInput.trim()) {
          send({ type: "EXECUTE_COMMAND", command: commandInput.trim() });
        } else {
          send({ type: "ESCAPE" });
        }
      } else if (key.escape) {
        // Cancel command on Escape
        send({ type: "ESCAPE" });
      } else if (key.backspace || key.delete) {
        // Handle backspace
        const newInput = commandInput.slice(0, -1);
        send({ type: "UPDATE_COMMAND_INPUT", input: newInput });
      } else if (input && !key.ctrl && !key.meta) {
        // Add regular characters to command input
        const newInput = commandInput + input;
        send({ type: "UPDATE_COMMAND_INPUT", input: newInput });
      }
    }
  });

  // Get display name for current mode
  const getModeDisplayName = (currentMode: VimMode): string => {
    if (customModeNames && customModeNames[currentMode]) {
      return customModeNames[currentMode]!;
    }

    // Default mode names with visual indicators
    switch (currentMode) {
      case "NORMAL":
        return "NORMAL";
      case "INSERT":
        return "INSERT";
      case "VISUAL":
        return "VISUAL";
      case "COMMAND":
        return "COMMAND";
      default:
        return currentMode;
    }
  };

  // Format the status line content
  const formatStatusLine = () => {
    const parts: string[] = [];

    // Add mode indicator if enabled
    if (showMode) {
      const modeDisplay = getModeDisplayName(mode);
      parts.push(`-- ${modeDisplay} --`);
    }

    // Add command buffer (numeric prefix) if present and enabled
    // Show pending commands from command buffer in NORMAL mode
    if (showCommandBuffer && commandBuffer && mode === "NORMAL") {
      parts.push(commandBuffer);
    }

    // Display command input text in COMMAND mode
    if (mode === "COMMAND") {
      parts.push(`:${commandInput}`);
    }

    // Add status message if present and enabled
    if (showMessage && statusMessage) {
      parts.push(statusMessage);
    }

    return parts.join(" ");
  };

  // Apply custom styling and positioning
  const textStyle = {
    color: style?.textColor,
  };

  const boxStyle: any = {
    backgroundColor: style?.backgroundColor,
  };

  // Add border styling if specified
  if (style?.borderStyle) {
    boxStyle.borderStyle = style.borderStyle;
  }

  // Position-specific styling
  const positionStyle =
    position === "top" ? { marginBottom: 1 } : { marginTop: 1 };

  return (
    <Box
      width="100%"
      justifyContent="flex-start"
      {...boxStyle}
      {...positionStyle}
    >
      <Text {...textStyle}>{formatStatusLine()}</Text>
    </Box>
  );
}
