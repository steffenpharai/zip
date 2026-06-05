import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: "var(--color-background)",
        "panel-surface": "var(--color-panel-surface)",
        "panel-surface-2": "var(--color-panel-surface-2)",
        border: "var(--color-border)",
        "accent-cyan": "#27B4CD",
        "accent-cyan-2": "#24B2E0",
        "text-primary": "var(--color-text-primary)",
        "text-muted": "var(--color-text-muted)",
        "online-green": "#2EE59D",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "sans-serif"],
      },
      letterSpacing: {
        "zip": "0.22em",
      },
    },
  },
  plugins: [],
};
export default config;

