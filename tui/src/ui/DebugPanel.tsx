import { Box, Text } from "ink";
import { useXStateDebug } from "@/debug/xstateDebug";
import { theme } from "@/ui/theme";

interface DebugPanelProps {
  isVisible: boolean;
}

export function DebugPanel({ isVisible }: DebugPanelProps) {
  const { getTransitionLogs, getErrorLogs, getDebugInfo } = useXStateDebug();

  if (!isVisible) return null;

  const debugInfo = getDebugInfo();
  const transitions = getTransitionLogs().slice(-4); // Show fewer to fit more info
  const errors = getErrorLogs().slice(-2);

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.focusBorder}
      paddingX={1}
      height={10} // Increased height for more info
    >
      <Box justifyContent="space-between">
        <Text bold>🐛 XState Debug Panel</Text>
        <Text dimColor>
          {debugInfo.transitions}T/{debugInfo.errors}E
        </Text>
      </Box>

      {/* Recent Transitions */}
      <Text bold color="blue">
        Recent Transitions:
      </Text>
      {transitions.length === 0 ? (
        <Text dimColor>No transitions yet</Text>
      ) : (
        transitions.map((log, i) => (
          <Text key={i} dimColor>
            [{log.timestamp.split("T")[1]?.split(".")[0] || "??:??:??"}]{" "}
            {log.machineId}: {String(log.fromState)} → {String(log.toState)}
            {log.duration ? ` (${log.duration.toFixed(1)}ms)` : ""}
          </Text>
        ))
      )}

      {/* Recent Errors */}
      {errors.length > 0 && (
        <>
          <Text bold color="red">
            Recent Errors:
          </Text>
          {errors.map((log, i) => (
            <Text key={i} color="red">
              [{log.timestamp.split("T")[1]?.split(".")[0] || "??:??:??"}]{" "}
              {log.machineId}: {log.error.message}
              {log.event && ` (${log.event.type})`}
            </Text>
          ))}
        </>
      )}

      {/* Controls */}
      <Box justifyContent="space-between">
        <Text dimColor>
          Logs: {debugInfo.transitions}T/{debugInfo.errors}E | File:
          .pigeon/logs/
        </Text>
        <Text dimColor>Press 'd' to toggle, Ctrl+I to clear</Text>
      </Box>
    </Box>
  );
}
