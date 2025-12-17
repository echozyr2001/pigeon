// StatusLine component for displaying Vim mode and status

import { Box, Text, useInput } from "ink";
import { useVimMode } from "../hooks/index.js";

export function StatusLine() {
  const { mode, commandBuffer, statusMessage, commandInput, send } =
    useVimMode();

  // Handle input in COMMAND mode
  useInput(
    (input, key) => {
      if (mode === "COMMAND") {
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
    },
    { isActive: mode === "COMMAND" }
  );

  // Format the status line content
  const formatStatusLine = () => {
    const parts: string[] = [];

    // Add mode indicator
    parts.push(`-- ${mode} --`);

    // Add command buffer (numeric prefix) if present
    if (commandBuffer && mode === "NORMAL") {
      parts.push(commandBuffer);
    }

    // Add command input in COMMAND mode
    if (mode === "COMMAND") {
      parts.push(`:${commandInput}`);
    }

    // Add status message if present
    if (statusMessage) {
      parts.push(statusMessage);
    }

    return parts.join(" ");
  };

  return (
    <Box width="100%" justifyContent="flex-start">
      <Text>{formatStatusLine()}</Text>
    </Box>
  );
}
