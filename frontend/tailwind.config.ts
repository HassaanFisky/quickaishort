import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "hsl(221, 83%, 53%)",
          50: "hsl(221, 83%, 96%)",
          100: "hsl(221, 83%, 90%)",
          200: "hsl(221, 83%, 80%)",
          300: "hsl(221, 83%, 70%)",
          400: "hsl(221, 83%, 60%)",
          500: "hsl(221, 83%, 53%)",
          600: "hsl(221, 83%, 45%)",
          700: "hsl(221, 83%, 38%)",
          800: "hsl(221, 83%, 30%)",
          900: "hsl(221, 83%, 22%)",
        },
        accent: {
          DEFAULT: "hsl(330, 81%, 60%)",
          50: "hsl(330, 81%, 96%)",
          100: "hsl(330, 81%, 90%)",
          200: "hsl(330, 81%, 80%)",
          300: "hsl(330, 81%, 70%)",
          400: "hsl(330, 81%, 63%)",
          500: "hsl(330, 81%, 60%)",
          600: "hsl(330, 81%, 50%)",
          700: "hsl(330, 81%, 40%)",
          800: "hsl(330, 81%, 30%)",
          900: "hsl(330, 81%, 20%)",
        },
        surface: {
          DEFAULT: "hsl(0, 0%, 7%)",
          50: "hsl(0, 0%, 95%)",
          100: "hsl(0, 0%, 90%)",
          200: "hsl(0, 0%, 80%)",
          300: "hsl(0, 0%, 60%)",
          400: "hsl(0, 0%, 40%)",
          500: "hsl(0, 0%, 25%)",
          600: "hsl(0, 0%, 18%)",
          700: "hsl(0, 0%, 13%)",
          800: "hsl(0, 0%, 9%)",
          900: "hsl(0, 0%, 7%)",
          950: "hsl(0, 0%, 4%)",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      borderRadius: {
        "4xl": "2rem",
      },
      animation: {
        "fade-in": "fadeIn 0.5s ease-out",
        "slide-up": "slideUp 0.5s ease-out",
        "pulse-glow": "pulseGlow 2s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        slideUp: {
          from: { opacity: "0", transform: "translateY(20px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        pulseGlow: {
          "0%, 100%": { boxShadow: "0 0 20px rgba(59, 130, 246, 0.3)" },
          "50%": { boxShadow: "0 0 40px rgba(59, 130, 246, 0.6)" },
        },
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
