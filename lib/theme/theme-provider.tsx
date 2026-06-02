"use client";

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";

type Theme = "dark" | "light";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = "zip-theme";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  const applyTheme = useCallback((newTheme: Theme) => {
    if (typeof document !== "undefined") {
      const root = document.documentElement;
      
      // Remove any existing inline style overrides first
      root.style.removeProperty("--color-background");
      root.style.removeProperty("--color-panel-surface");
      root.style.removeProperty("--color-panel-surface-2");
      root.style.removeProperty("--color-border");
      root.style.removeProperty("--color-text-primary");
      root.style.removeProperty("--color-text-muted");
      
      // Toggle the dark class - this should trigger CSS variable changes
      if (newTheme === "dark") {
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
      }
      
      // Force a reflow to ensure styles are applied
      void root.offsetHeight;
    }
  }, []);

  useEffect(() => {
    // Only run on client side
    setMounted(true);
    
    // Get theme from localStorage or default to dark
    const storedTheme = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
    const initialTheme = storedTheme === "light" || storedTheme === "dark" ? storedTheme : "dark";
    
    setThemeState(initialTheme);
    applyTheme(initialTheme);
  }, [applyTheme]);

  // Sync theme state with DOM
  useEffect(() => {
    if (mounted) {
      applyTheme(theme);
    }
  }, [theme, mounted, applyTheme]);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    if (typeof window !== "undefined") {
      localStorage.setItem(THEME_STORAGE_KEY, newTheme);
    }
    applyTheme(newTheme);
  }, [applyTheme]);

  const toggleTheme = useCallback(() => {
    setThemeState((currentTheme) => {
      const newTheme = currentTheme === "dark" ? "light" : "dark";
      
      // Apply theme immediately using the applyTheme function
      applyTheme(newTheme);
      
      // Save to localStorage
      if (typeof window !== "undefined") {
        localStorage.setItem(THEME_STORAGE_KEY, newTheme);
      }
      
      return newTheme;
    });
  }, [applyTheme]);

  // Always provide context, even before mounted
  // The script in layout.tsx handles initial theme application
  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}

