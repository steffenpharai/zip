"use client";

import { ThemeProvider } from "@/lib/theme/theme-provider";
import { ProjectorProvider } from "@/lib/projector/projector-provider";

export function ThemeWrapper({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <ProjectorProvider>{children}</ProjectorProvider>
    </ThemeProvider>
  );
}

