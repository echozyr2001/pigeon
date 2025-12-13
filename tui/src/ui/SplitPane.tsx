import React from "react";
import { Box } from "ink";

export function HSplit(props: {
  left: React.ReactNode;
  right: React.ReactNode;
  leftWidth: number;
  gap?: number;
}) {
  const gap = props.gap ?? 1;
  return (
    <Box flexDirection="row" gap={gap} width="100%">
      <Box width={props.leftWidth} flexShrink={0}>
        {props.left}
      </Box>
      <Box flexGrow={1} minWidth={0}>
        {props.right}
      </Box>
    </Box>
  );
}

export function VSplit(props: {
  top: React.ReactNode;
  bottom: React.ReactNode;
  topFlex?: number;
  bottomFlex?: number;
  gap?: number;
}) {
  const gap = props.gap ?? 1;

  // Ink/yoga only allocates vertical flex space reliably when the parent has a fixed height.
  // For phase-1 we keep it simple: stack two panes and rely on internal fixed heights.
  // (Our TextArea uses explicit `height`.)
  return (
    <Box flexDirection="column" gap={gap} width="100%">
      <Box>{props.top}</Box>
      <Box>{props.bottom}</Box>
    </Box>
  );
}
