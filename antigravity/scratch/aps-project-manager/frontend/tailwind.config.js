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
        sky: {
          50: '#fbf3f4',
          100: '#f5e6e9',
          200: '#ebcdd4',
          300: '#dba8b4',
          400: '#c77e90',
          500: '#aa5269',
          600: '#861b36',
          700: '#70172e',
          800: '#5e172b',
          900: '#4d1727',
          950: '#2c0a13',
        },
        amber: {
          50: '#fcf8eb',
          100: '#f8efcf',
          200: '#f1dfa0',
          300: '#eacb6e',
          400: '#e6b83e',
          500: '#a87512',
          600: '#936017',
          700: '#794d1b',
          800: '#67401c',
          900: '#523317',
          950: '#3b220d',
        },
        aps: {
          blue: '#861b36',
          dark: '#2c292a',
          accent: '#e6a51e',
          subtle: '#f5f2ed',
          cardDark: '#393536'
        }
      },
      borderRadius: {
        'aps': '12px',
      }
    },
  },
  plugins: [],
}
