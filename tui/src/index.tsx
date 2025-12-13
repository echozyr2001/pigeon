import React from "react";
import { render } from "ink";
import { ThemeProvider, defaultTheme } from "@inkjs/ui";
import { App } from "@/app";

render(
  <ThemeProvider theme={defaultTheme}>
    <App />
  </ThemeProvider>
);
