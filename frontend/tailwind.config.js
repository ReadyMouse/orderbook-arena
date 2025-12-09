/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // 8-bit retro arcade theme colors
        'arcade-bg': '#0a0a0a',      // Dark background
        'arcade-dark': '#1a1a1a',    // Darker elements
        'arcade-red': '#ff0040',     // Sellers/asks (left side)
        'arcade-blue': '#00d4ff',    // Buyers/bids (right side)
        'arcade-yellow': '#ffed00',  // Accent/highlight
        'arcade-green': '#00ff41',   // Success/positive
        'arcade-purple': '#b400ff',  // Special elements
        'arcade-white': '#ffffff',   // Text/centerline
        'arcade-gray': '#808080',    // Secondary text
      },
      fontFamily: {
        'arcade': ['Courier New', 'monospace'], // Pixelated/retro font
      },
      boxShadow: {
        'arcade': '4px 4px 0px 0px rgba(0, 0, 0, 0.8)',
        'arcade-lg': '8px 8px 0px 0px rgba(0, 0, 0, 0.8)',
      },
    },
  },
  plugins: [],
}

