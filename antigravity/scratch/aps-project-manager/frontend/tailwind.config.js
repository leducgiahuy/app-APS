/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        aps: {
          blue: '#0284c7',
          dark: '#0f172a',
          accent: '#2563eb',
          subtle: '#f8fafc',
          cardDark: '#1e293b'
        }
      },
      borderRadius: {
        'aps': '12px',
      }
    },
  },
  plugins: [],
}
