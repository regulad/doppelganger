import type { Config } from "tailwindcss";

// The site's type scale. Body sizes keep a 1.5 line height; from xl up, each
// step adds 0.25rem, so the largest heading (10xl) is 3.5rem, much smaller
// than Tailwind's default, and headings stay readable on phones.
const headingSizes = [
  "xl",
  "2xl",
  "3xl",
  "4xl",
  "5xl",
  "6xl",
  "7xl",
  "8xl",
  "9xl",
  "10xl",
];
const fontSize: Record<string, [string, { lineHeight: string }]> = {
  xs: ["0.75rem", { lineHeight: "1.5" }],
  sm: ["0.875rem", { lineHeight: "1.5" }],
  base: ["1rem", { lineHeight: "1.5" }],
  md: ["1.125rem", { lineHeight: "1.5" }],
  lg: ["1.25rem", { lineHeight: "1.5" }],
  ...Object.fromEntries(
    headingSizes.map((size, step) => {
      const rem = 1.25 + 0.25 * step;
      const lineHeight = rem < 2 ? "1.4" : rem < 2.25 ? "1.3" : "1.2";
      return [size, [`${rem}rem`, { lineHeight }]];
    }),
  ),
};

const config = {
  darkMode: ["class"],
  content: ["./src/**/*.{js,ts,jsx,tsx,md,mdx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        sm: "100%",
        md: "100%",
        lg: "992px",
        xl: "1280px",
        "2xl": "1400px",
      },
    },
    extend: {
      maxWidth: { sm: "30rem", lg: "48rem" },
      fontSize,
      spacing: { 18: "4.5rem" },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
      screens: {
        xs: "450px",
        xxl: "1440px",
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
} satisfies Config;

export default config;
