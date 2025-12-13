export type Palette = {
  // Provided palette colors (4-step)
  c1: string;
  c2: string;
  c3: string;
  c4: string;
};

export const palettes = {
  autumn: {
    c1: "#D97D55",
    c2: "#F4E9D7",
    c3: "#B8C4A9",
    c4: "#6FA4AF",
  },
  sage: {
    c1: "#819A91",
    c2: "#A7C1A8",
    c3: "#D1D8BE",
    c4: "#EEEFE0",
  },
  sand: {
    c1: "#FFF2D7",
    c2: "#FFE0B5",
    c3: "#F8C794",
    c4: "#D8AE7E",
  },
} as const satisfies Record<string, Palette>;

export type PaletteName = keyof typeof palettes;

// Global selection (change here to switch theme everywhere)
export const currentPaletteName: PaletteName = "sage";

export const currentPalette: Palette = palettes[currentPaletteName];

// Semantic tokens (components should use these, not raw palette slots)
export const theme = {
  palette: currentPalette,

  // UI tokens
  focusBorder: currentPalette.c1,
  keyHint: currentPalette.c1,
  tabActiveUnderline: currentPalette.c1,
  tabDot: currentPalette.c4,

  borderIdle: "gray",
  textDim: "gray",
} as const;
