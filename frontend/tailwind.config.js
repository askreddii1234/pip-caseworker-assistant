/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        govuk: {
          blue: '#1d70b8',
          dark: '#0b0c0c',
          grey: '#505a5f',
          light: '#f3f2f1',
          green: '#00703c',
          red: '#d4351c',
          yellow: '#ffdd00',
          orange: '#f47738',
          white: '#ffffff',
        }
      },
      fontFamily: {
        sans: ['"GDS Transport"', 'Arial', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
