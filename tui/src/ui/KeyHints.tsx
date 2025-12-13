import React from "react";
import { Box, Text } from "ink";

export function KeyHints(props: {
  items: Array<{ key: string; label: string }>;
}) {
  return (
    <Box flexDirection="row" gap={2} flexWrap="wrap">
      {props.items.map((it) => (
        <Box key={`${it.key}-${it.label}`} flexDirection="row" gap={1}>
          <Text color="magenta" bold>
            {it.key}
          </Text>
          <Text>{it.label}</Text>
        </Box>
      ))}
    </Box>
  );
}
