import React, { useMemo } from "react";
import { Box, Text, useInput } from "ink";
import { theme } from "@/ui/theme";

export type TabDef<T extends string> = { id: T; label: string };

export function TabBar<T extends string>(props: {
  tabs: ReadonlyArray<TabDef<T>>;
  activeTab: T;
  isActive: boolean;
  onChange: (tab: T) => void;
}) {
  const indexById = useMemo(() => {
    const map = new Map<T, number>();
    props.tabs.forEach((t, i) => map.set(t.id, i));
    return map;
  }, [props.tabs]);

  const activeIndex = indexById.get(props.activeTab) ?? 0;

  useInput(
    (_input, key) => {
      if (!props.isActive) return;
      if (key.leftArrow) {
        const next = Math.max(0, activeIndex - 1);
        props.onChange(props.tabs[next]!.id);
      }
      if (key.rightArrow) {
        const next = Math.min(props.tabs.length - 1, activeIndex + 1);
        props.onChange(props.tabs[next]!.id);
      }
    },
    { isActive: props.isActive }
  );

  return (
    <Box flexDirection="row" gap={2}>
      {props.tabs.map((t) => {
        const isActiveTab = t.id === props.activeTab;
        return (
          <Box key={t.id} flexDirection="column">
            <Text color={isActiveTab ? "white" : "gray"} bold={isActiveTab}>
              {t.label}
              {t.label === "Headers" ? (
                <Text color={theme.tabDot}>•</Text>
              ) : null}
            </Text>
            <Text color={isActiveTab ? theme.tabActiveUnderline : "black"}>
              {isActiveTab ? "─".repeat(Math.max(1, t.label.length)) : " "}
            </Text>
          </Box>
        );
      })}
      {props.isActive ? <Text dimColor> ←/→</Text> : null}
    </Box>
  );
}
