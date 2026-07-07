/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
      },
      fontWeight: {
        700: "700",
      },
      fontSize: {
        pageTitle: [
          "28px",
          { lineHeight: "34px", letterSpacing: "-0.02em", fontWeight: "700" },
        ],
        display: [
          "30px",
          { lineHeight: "36px", letterSpacing: "-0.02em", fontWeight: "600" },
        ],
        h2: [
          "20px",
          { lineHeight: "28px", letterSpacing: "-0.01em", fontWeight: "600" },
        ],
        h3: [
          "16px",
          { lineHeight: "24px", letterSpacing: "0", fontWeight: "600" },
        ],
        sectionLabel: [
          "12px",
          { lineHeight: "16px", letterSpacing: "0.06em", fontWeight: "600" },
        ],
        body: [
          "14px",
          { lineHeight: "22px", letterSpacing: "0", fontWeight: "400" },
        ],
        label: [
          "14px",
          { lineHeight: "20px", letterSpacing: "0", fontWeight: "500" },
        ],
        small: [
          "13px",
          { lineHeight: "18px", letterSpacing: "0", fontWeight: "400" },
        ],
        caption: [
          "12px",
          { lineHeight: "16px", letterSpacing: "0", fontWeight: "500" },
        ],
      },
      colors: {
        canvas: "#F5F5F6",
        surface: {
          DEFAULT: "#FFFFFF",
          subtle: "#FAFAFA",
          muted: "#F1F1F3",
        },
        bg: {
          base: "#FFFFFF",
          subtle: "#FAFAFA",
          muted: "#F1F1F3",
        },
        border: {
          DEFAULT: "#E4E4E7",
          strong: "#D4D4D8",
        },
        text: {
          DEFAULT: "#0A0A0A",
          secondary: "#3F3F46",
          muted: "#71717A",
          inverse: "#FFFFFF",
        },
        brand: {
          50: "#EEF2FF",
          100: "#E0E7FF",
          500: "#375DFB",
          600: "#2B4ACB",
          700: "#2438A6",
        },
        success: "#1FC16B",
        warning: "#F6B51E",
        error: "#FB3748",
      },
      borderRadius: {
        sm: "8px",
        md: "10px",
        lg: "12px",
        xl: "16px",
      },
      boxShadow: {
        xs: "0 1px 2px 0 rgba(16,24,40,0.06)",
        sm: "0 2px 4px -1px rgba(16,24,40,0.08), 0 1px 2px -1px rgba(16,24,40,0.06)",
        md: "0 8px 16px -4px rgba(16,24,40,0.10), 0 3px 6px -3px rgba(16,24,40,0.08)",
        lg: "0 16px 32px -8px rgba(16,24,40,0.12), 0 6px 12px -6px rgba(16,24,40,0.06)",
      },
    },
  },
  plugins: [],
};
