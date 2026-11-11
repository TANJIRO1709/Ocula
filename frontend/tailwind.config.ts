import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: "#0B1A2C", 700: "#13263D", 600: "#23405F" },
        teal: { DEFAULT: "#0F766E", light: "#2DD4BF", pale: "#E6F2EF" },
        amber: { DEFAULT: "#F59E0B", dark: "#B45309", pale: "#FEF3C7" },
        paper: "#F4F6F5",
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
