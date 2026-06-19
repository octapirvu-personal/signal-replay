/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Pro-trading dark palette (matches the prototype aesthetic).
        bg: "#0e1116",
        panel: "#161b22",
        panel2: "#1c2230",
        line: "#2a3240",
        ink: "#e6edf3",
        muted: "#8b97a7",
        buy: "#26a69a",
        sell: "#ef5350",
        accent: "#3b82f6",
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};
