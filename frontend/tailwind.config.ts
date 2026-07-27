import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        msblue: {
          DEFAULT: "#0078d4",
          light: "#50e6ff",
          dark: "#003f8a",
        },
        surface: {
          DEFAULT: "#0f1117",
          card: "#1a1f2e",
          border: "#2d3448",
          hover: "#232a3a",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Segoe UI", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
