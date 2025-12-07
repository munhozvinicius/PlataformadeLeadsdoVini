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
        background: "var(--background)",
        foreground: "var(--foreground)",
        "neon-pink": "#FF0099",
        "neon-green": "#CCFF00",
        "pic-dark": "#0f0518", // Dark purple/black background
        "pic-card": "#1a1025", // Slightly lighter card background
        "pic-zinc": "#2a2035", // Border/input background
      },
    },
  },
  plugins: [],
};
export default config;
