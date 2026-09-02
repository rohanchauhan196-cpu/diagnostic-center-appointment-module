import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        medical: {
          50:  "#eef6ff",
          100: "#d9ecff",
          200: "#bbdeff",
          300: "#8ecaff",
          400: "#58adfc",
          500: "#2f8ef4",
          600: "#1a6fe8",
          700: "#1557d6",
          800: "#1744ad",
          900: "#193d88",
          950: "#122554",
        },
        accent: {
          50:  "#f0fdf9",
          100: "#ccfbef",
          200: "#99f6e0",
          300: "#5eead4",
          400: "#2dd4bf",
          500: "#14b8a6",
          600: "#0d9488",
          700: "#0f766e",
          800: "#115e59",
          900: "#134e4a",
        },
        surface: {
          50:  "#f8fafc",
          100: "#f1f5f9",
          800: "#1e293b",
          900: "#0f172a",
          950: "#080f1e",
        }
      },
      fontFamily: {
        sans: ["'Inter'", "system-ui", "sans-serif"],
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "glass": "linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.03))",
      },
      boxShadow: {
        glass: "0 8px 32px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.15)",
        "glass-dark": "0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)",
        "glow-blue": "0 0 20px rgba(47, 142, 244, 0.35)",
        "glow-teal": "0 0 20px rgba(20, 184, 166, 0.35)",
        card: "0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.06)",
        "card-hover": "0 4px 24px rgba(0,0,0,0.12)",
      },
      animation: {
        "gradient-shift": "gradient-shift 6s ease infinite",
        "fade-in": "fade-in 0.3s ease forwards",
        "slide-up": "slide-up 0.3s ease forwards",
        "pulse-glow": "pulse-glow 3s ease-in-out infinite",
      },
      keyframes: {
        "gradient-shift": {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-glow": {
          "0%, 100%": { opacity: "0.6" },
          "50%": { opacity: "1" },
        },
      },
    }
  },
  plugins: []
};

export default config;
