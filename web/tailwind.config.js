/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef7f4',
          100: '#d5ece3',
          200: '#aed9c9',
          300: '#7dbfa9',
          400: '#4ea089',
          500: '#33836f',
          600: '#26695a',
          700: '#215449',
          800: '#1d443c',
          900: '#193933',
        },
      },
    },
  },
  plugins: [],
};
