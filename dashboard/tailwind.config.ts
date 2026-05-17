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
        usdc: "#1A56DB",
        eurc: "#0E9F6E",
        usyc: "#B45309",
        dark: {
          bg: "#0a0a0f",
          card: "#111827",
          border: "#1f2937",
        },
      },
    },
  },
  plugins: [],
};
export default config;
