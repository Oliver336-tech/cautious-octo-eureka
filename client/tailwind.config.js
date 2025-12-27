/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#d97706',
        accent: '#7c3aed'
      }
    }
  },
  plugins: []
};
