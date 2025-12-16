import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import type { HttpMethod } from "@/types";

export function MethodDropdown(props: {
  value: HttpMethod;
  options: Array<{ label: string; value: HttpMethod }>;
  isActive: boolean;
  isDisabled: boolean;
  onChange: (value: HttpMethod) => void;
  onOpenChange?: (isOpen: boolean) => void;
  onHighlightChange?: (index: number) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  // Find current option index
  const currentIndex = props.options.findIndex(
    (opt) => opt.value === props.value
  );

  // Reset highlighted index only when opening (not when currentIndex changes)
  const prevIsOpenRef = React.useRef(false);
  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      // Only reset when opening, not when already open
      const idx = currentIndex >= 0 ? currentIndex : 0;
      setHighlightedIndex(idx);
      // Delay callback to avoid updating parent during render
      queueMicrotask(() => {
        props.onHighlightChange?.(idx);
      });
    }
    prevIsOpenRef.current = isOpen;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]); // Only depend on isOpen, not currentIndex, to avoid resetting during navigation

  // Close dropdown when disabled or loses focus
  useEffect(() => {
    if (props.isDisabled || !props.isActive) {
      setIsOpen(false);
    }
  }, [props.isDisabled, props.isActive]);

  // Notify parent of open state changes
  useEffect(() => {
    // Delay callback to avoid updating parent during render
    queueMicrotask(() => {
      props.onOpenChange?.(isOpen);
    });
  }, [isOpen]); // Remove props from dependencies

  useInput(
    (input, key) => {
      if (!props.isActive || props.isDisabled) return;

      // Toggle dropdown with Enter or Space when closed
      if (!isOpen && (key.return || input === " ")) {
        setIsOpen(true);
        return;
      }

      if (isOpen) {
        // Navigate with arrow keys
        if (key.upArrow) {
          setHighlightedIndex((idx) => {
            const next = idx > 0 ? idx - 1 : props.options.length - 1;
            // Delay callback to avoid updating parent during render
            queueMicrotask(() => {
              props.onHighlightChange?.(next);
            });
            return next;
          });
          return;
        }
        if (key.downArrow) {
          setHighlightedIndex((idx) => {
            const next = idx < props.options.length - 1 ? idx + 1 : 0;
            // Delay callback to avoid updating parent during render
            queueMicrotask(() => {
              props.onHighlightChange?.(next);
            });
            return next;
          });
          return;
        }

        // Select with Enter
        if (key.return) {
          const selected = props.options[highlightedIndex];
          if (selected) {
            props.onChange(selected.value);
            setIsOpen(false);
          }
          return;
        }

        // Close with Escape
        if (key.escape) {
          setIsOpen(false);
          return;
        }
      }
    },
    { isActive: props.isActive && !props.isDisabled }
  );

  const currentOption = props.options.find((opt) => opt.value === props.value);
  const displayLabel = currentOption?.label ?? props.value;

  return (
    <Box>
      {/* Current selection display - only the button, no dropdown here */}
      <Box
        borderStyle="round"
        borderColor={props.isActive && !props.isDisabled ? "green" : "gray"}
        paddingX={1}
        minWidth={8}
      >
        <Text color={props.isDisabled ? "gray" : "white"}>
          {displayLabel}
          {isOpen ? " ▼" : " ▶"}
        </Text>
      </Box>
    </Box>
  );
}

// Separate component for the dropdown menu overlay
// Uses absolute positioning to create a true floating overlay
export function MethodDropdownMenu(props: {
  isOpen: boolean;
  value: HttpMethod;
  options: Array<{ label: string; value: HttpMethod }>;
  highlightedIndex: number;
  onSelect: (value: HttpMethod) => void;
  // Position for absolute positioning (relative to parent)
  top?: number;
  left?: number;
}) {
  if (!props.isOpen) return null;

  return (
    <Box
      position="absolute"
      marginTop={props.top ?? 0}
      marginLeft={props.left ?? 0}
      // Ensure it's rendered on top by being the last element
    >
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="green"
        minWidth={8}
        backgroundColor="black"
        // Add black background to make it fully opaque and hide content behind
      >
        {props.options.map((option, index) => {
          const isSelected = option.value === props.value;
          const isHighlighted = index === props.highlightedIndex;

          return (
            <Box
              key={option.value}
              paddingX={1}
              backgroundColor={
                isHighlighted ? "blue" : isSelected ? "green" : "black" // Always have background to ensure opacity
              }
            >
              <Text
                color={isSelected ? "white" : isHighlighted ? "white" : "gray"}
              >
                {isSelected ? "✓ " : isHighlighted ? "> " : "  "}
                {option.label}
              </Text>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
